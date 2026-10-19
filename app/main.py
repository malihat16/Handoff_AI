import asyncio
import contextlib
import hmac
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .config import BASE_DIR, Settings, load_settings, load_workflows
from .db import Contact, Database, Invoice, Notification, Run, Task
from .engine import Engine, EngineError
from .ingest import extract_text
from .llm import build_llm
from .reports import compute_stats, daily_report, send_daily_report
from .serializers import row_to_dict, run_to_dict
from .steps import STEPS

STATIC_DIR = Path(__file__).parent / "static"
SAMPLES_DIR = BASE_DIR / "samples"
DATA_MODELS = {"contacts": Contact, "tasks": Task, "invoices": Invoice, "notifications": Notification}


class RunIn(BaseModel):
    workflow: str
    text: str = Field(min_length=1, max_length=200_000)
    source: str = "api"


class WebhookIn(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    source: str = "webhook"


class DecisionIn(BaseModel):
    approver: str = Field(default="reviewer", max_length=120)
    comment: str | None = Field(default=None, max_length=1000)


async def _report_loop(database: Database, workflows: dict, hour: int) -> None:
    def job() -> None:
        with database.sessionmaker() as db:
            send_daily_report(db, workflows)

    while True:
        now = datetime.now(timezone.utc)
        nxt = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if nxt <= now:
            nxt += timedelta(days=1)
        await asyncio.sleep((nxt - now).total_seconds())
        await asyncio.to_thread(job)


def create_app(settings: Settings | None = None, llm=None, database_url: str | None = None,
               steps: dict | None = None, workflows: dict | None = None,
               backoff: float | None = None) -> FastAPI:
    settings = settings or load_settings()
    database = Database(database_url or settings.database_url)
    llm = llm or build_llm(settings.anthropic_api_key, settings.llm_model)
    wf_config = workflows if workflows is not None else load_workflows(settings.workflows_path)
    engine = Engine(wf_config, steps or STEPS, llm, max_retries=settings.max_retries,
                    backoff=settings.retry_backoff if backoff is None else backoff)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if settings.daily_report_hour_utc is not None:
            task = asyncio.create_task(_report_loop(database, wf_config, settings.daily_report_hour_utc))
        yield
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Handoff AI", version="1.0.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.database = database

    @app.exception_handler(EngineError)
    async def engine_error_handler(_, exc: EngineError):
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

    def get_db():
        session = database.sessionmaker()
        try:
            yield session
        finally:
            session.close()

    def require_key(x_api_key: str | None = Header(default=None)) -> None:
        if settings.api_key and not hmac.compare_digest(
                (x_api_key or "").encode(), settings.api_key.encode()):
            raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")

    def get_run(db: Session, run_id: int) -> Run:
        run = db.get(Run, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Run #{run_id} not found")
        return run

    def ser(run: Run, detail: bool = False) -> dict:
        step_names = [s["step"] for s in wf_config.get(run.workflow, {}).get("steps", [])]
        return run_to_dict(run, detail=detail, steps=step_names)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "llm": llm.name, "auth_required": bool(settings.api_key),
                "workflows": list(wf_config)}

    api = APIRouter(prefix="/api", dependencies=[Depends(require_key)])

    @api.get("/workflows")
    def list_workflows():
        return [
            {"name": name, "description": wf.get("description", ""), "trigger": wf.get("trigger"),
             "minutes_saved": wf.get("minutes_saved", 0), "steps": [s["step"] for s in wf["steps"]]}
            for name, wf in wf_config.items()
        ]

    @api.post("/runs", status_code=201)
    def create_run(body: RunIn, response: Response, db: Session = Depends(get_db)):
        run, duplicate = engine.submit(db, body.workflow, body.text, body.source)
        if duplicate:
            response.status_code = 200
        return {"duplicate": duplicate, "run": ser(run)}

    @api.post("/webhooks/{workflow}", status_code=201)
    def webhook(workflow: str, body: WebhookIn, response: Response, db: Session = Depends(get_db)):
        """Entry point for n8n / Zapier / any HTTP caller."""
        run, duplicate = engine.submit(db, workflow, body.text, body.source)
        if duplicate:
            response.status_code = 200
        return {"duplicate": duplicate, "run": ser(run)}

    @api.post("/runs/upload", status_code=201)
    def upload_run(response: Response, workflow: str = Form(...), file: UploadFile = File(...),
                   db: Session = Depends(get_db)):
        text = extract_text(file.filename or "", file.file.read(5 * 1024 * 1024 + 1))
        run, duplicate = engine.submit(db, workflow, text, f"upload:{file.filename}")
        if duplicate:
            response.status_code = 200
        return {"duplicate": duplicate, "run": ser(run)}

    @api.get("/runs")
    def list_runs(status: str | None = None, workflow: str | None = None,
                  q: str | None = Query(None, max_length=100),
                  limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
        stmt = select(Run).order_by(Run.id.desc()).limit(limit)
        if status:
            stmt = stmt.where(Run.status == status)
        if workflow:
            stmt = stmt.where(Run.workflow == workflow)
        if q and q.strip():
            term = q.strip()
            like = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            cond = Run.input_text.ilike(like, escape="\\")
            if term.lstrip("#").isdigit():
                cond = or_(cond, Run.id == int(term.lstrip("#")))
            stmt = stmt.where(cond)
        return [ser(r) for r in db.scalars(stmt)]

    @api.get("/runs/{run_id}")
    def run_detail(run_id: int, db: Session = Depends(get_db)):
        return ser(get_run(db, run_id), detail=True)

    @api.post("/runs/{run_id}/approve")
    def approve(run_id: int, body: DecisionIn | None = None, db: Session = Depends(get_db)):
        body = body or DecisionIn()
        return ser(engine.decide(db, get_run(db, run_id), True, body.approver, body.comment),
                           detail=True)

    @api.post("/runs/{run_id}/reject")
    def reject(run_id: int, body: DecisionIn | None = None, db: Session = Depends(get_db)):
        body = body or DecisionIn()
        return ser(engine.decide(db, get_run(db, run_id), False, body.approver, body.comment),
                           detail=True)

    @api.post("/runs/{run_id}/retry")
    def retry(run_id: int, db: Session = Depends(get_db)):
        return ser(engine.retry(db, get_run(db, run_id)), detail=True)

    @api.get("/stats")
    def stats(db: Session = Depends(get_db)):
        return compute_stats(db, wf_config)

    @api.get("/reports/daily")
    def report(day: date | None = Query(None, alias="date"), db: Session = Depends(get_db)):
        return daily_report(db, wf_config, day)

    @api.post("/reports/daily/send")
    def report_send(db: Session = Depends(get_db)):
        return send_daily_report(db, wf_config)

    @api.get("/data/{kind}")
    def data(kind: str, limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)):
        model = DATA_MODELS.get(kind)
        if model is None:
            raise HTTPException(status_code=404, detail=f"Unknown collection '{kind}'")
        return [row_to_dict(r) for r in db.scalars(select(model).order_by(model.id.desc()).limit(limit))]

    @api.post("/demo/seed")
    def seed(db: Session = Depends(get_db)):
        """Run every bundled sample through its workflow (idempotent thanks to dedup)."""
        plan = [("email_to_crm", SAMPLES_DIR / "emails"), ("invoice_to_approval", SAMPLES_DIR / "invoices")]
        results = []
        for workflow, folder in plan:
            for path in sorted(folder.glob("*.txt")):
                run, duplicate = engine.submit(db, workflow, path.read_text(encoding="utf-8"),
                                               f"demo:{path.name}")
                results.append({"file": path.name, "run_id": run.id, "status": run.status,
                                "duplicate": duplicate})
        return {"submitted": len(results), "new": sum(not r["duplicate"] for r in results),
                "duplicates": sum(r["duplicate"] for r in results), "runs": results}

    app.include_router(api)

    # The React dashboard is built into app/static (see frontend/); hashed assets are immutable.
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets", check_dir=False), name="assets")

    @app.get("/", include_in_schema=False)
    def dashboard():
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon():
        return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")

    return app
