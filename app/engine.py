"""Workflow engine: runs configured steps with retries, approvals, resumability and dedup."""
from __future__ import annotations

import copy
import hashlib
import time
from typing import Callable

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .db import Invoice, Notification, Run, RunLog, utcnow
from .steps import Context, PermanentError, Pause

# A re-submitted input is deduplicated against runs in these states.
DEDUP_STATES = ("pending", "running", "awaiting_approval", "completed")


class EngineError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class Engine:
    def __init__(self, workflows: dict[str, dict], steps: dict[str, Callable], llm,
                 max_retries: int = 3, backoff: float = 0.5, sleep: Callable[[float], None] = time.sleep):
        for wf_name, wf in workflows.items():
            for spec in wf["steps"]:
                if spec["step"] not in steps:
                    raise ValueError(f"workflow '{wf_name}' uses unknown step '{spec['step']}'")
        self.workflows = workflows
        self.steps = steps
        self.llm = llm
        self.max_retries = max(1, max_retries)
        self.backoff = backoff
        self.sleep = sleep

    # ------------------------------------------------------------------ public API
    @staticmethod
    def fingerprint(workflow: str, text: str) -> str:
        normalised = " ".join(text.split()).lower()
        return hashlib.sha256(f"{workflow}\0{normalised}".encode()).hexdigest()

    def submit(self, db: Session, workflow: str, text: str, source: str = "api") -> tuple[Run, bool]:
        """Create and execute a run. Returns (run, is_duplicate)."""
        if workflow not in self.workflows:
            raise EngineError(f"Unknown workflow '{workflow}'", 404)
        text = (text or "").strip()
        if not text:
            raise EngineError("Input text is empty", 422)
        fp = self.fingerprint(workflow, text)
        existing = db.scalar(
            select(Run).where(Run.workflow == workflow, Run.input_hash == fp,
                              Run.status.in_(DEDUP_STATES)).order_by(Run.id))
        if existing:
            return existing, True
        run = Run(workflow=workflow, source=source, status="pending", input_hash=fp,
                  input_text=text, state={"data": {}, "next_step": 0})
        db.add(run)
        db.commit()
        self._log(db, run, "info", f"Run created from {source}")
        return self.execute(db, run), False

    def decide(self, db: Session, run: Run, approve: bool, approver: str,
               comment: str | None = None) -> Run:
        if run.status != "awaiting_approval":
            raise EngineError(f"Run #{run.id} is '{run.status}', not awaiting approval", 409)
        run.approved_by = approver
        run.decision_comment = comment
        if approve:
            self._log(db, run, "info", f"Approved by {approver}" + (f": {comment}" if comment else ""))
            return self.execute(db, run)
        run.status = "rejected"
        run.finished_at = utcnow()
        db.execute(update(Invoice).where(Invoice.run_id == run.id).values(status="rejected"))
        db.add(Notification(run_id=run.id, channel="slack",
                            message=f"Run #{run.id} rejected by {approver}"))
        db.commit()
        self._log(db, run, "info", f"Rejected by {approver}" + (f": {comment}" if comment else ""))
        return run

    def retry(self, db: Session, run: Run) -> Run:
        if run.status != "failed":
            raise EngineError(f"Run #{run.id} is '{run.status}', only failed runs can be retried", 409)
        self._log(db, run, "info", "Manual retry requested; resuming from the failed step")
        return self.execute(db, run)

    # ------------------------------------------------------------------ execution
    def execute(self, db: Session, run: Run) -> Run:
        steps = self.workflows[run.workflow]["steps"]
        state = copy.deepcopy(run.state or {})
        state.setdefault("data", {})
        i = int(state.get("next_step", 0))
        run.status = "running"
        run.error = None
        db.commit()
        started = time.perf_counter()
        try:
            while i < len(steps):
                spec = steps[i]
                ctx = Context(db=db, run=run, data=state["data"], llm=self.llm,
                              approved_by=run.approved_by)
                outcome, step_ms, retries = self._run_step(
                    db, run, ctx, spec["step"], spec.get("params", {}))
                state.setdefault("metrics", {})[str(i)] = {"ms": step_ms, "retries": retries}
                state["next_step"] = i + 1
                run.state = copy.deepcopy(state)  # snapshot: survives retries/approval pauses
                if isinstance(outcome, Pause):
                    run.status = "awaiting_approval"
                    run.approval_reason = outcome.reason
                    db.add(Notification(
                        run_id=run.id, channel="slack",
                        message=f"Approval needed for run #{run.id} ({run.workflow}): {outcome.reason}"))
                    return run
                db.commit()
                i += 1
            run.status = "completed"
            run.finished_at = utcnow()
            self._log(db, run, "info", "Run completed")
        except Exception as exc:
            db.rollback()
            run.status = "failed"
            run.error = f"{type(exc).__name__}: {exc}"[:500]
            run.finished_at = utcnow()
            self._log(db, run, "error", run.error)
        finally:
            run.duration_ms = (run.duration_ms or 0) + int((time.perf_counter() - started) * 1000)
            db.commit()
        return run

    def _run_step(self, db: Session, run: Run, ctx: Context, name: str, params: dict):
        fn = self.steps[name]
        for attempt in range(1, self.max_retries + 1):
            ctx.logs.clear()
            t0 = time.perf_counter()
            try:
                outcome = fn(ctx, params)
                db.commit()
                self._flush(db, run, name, ctx.logs)
                ms = int((time.perf_counter() - t0) * 1000)
                self._log(db, run, "info", f"Step '{name}' succeeded in {ms} ms", name)
                return outcome, ms, attempt - 1
            except PermanentError as exc:
                db.rollback()
                self._flush(db, run, name, ctx.logs)
                self._log(db, run, "error", f"Step '{name}' failed permanently: {exc}", name)
                raise
            except Exception as exc:  # transient: retry with exponential backoff
                db.rollback()
                run.attempts = (run.attempts or 0) + 1
                self._log(db, run, "warning",
                          f"Step '{name}' attempt {attempt}/{self.max_retries} failed: "
                          f"{type(exc).__name__}: {exc}", name)
                if attempt == self.max_retries:
                    raise
                self.sleep(self.backoff * 2 ** (attempt - 1))

    # ------------------------------------------------------------------ logging
    def _log(self, db: Session, run: Run, level: str, message: str, step: str | None = None) -> None:
        db.add(RunLog(run_id=run.id, level=level, step=step, message=message))
        db.commit()

    def _flush(self, db: Session, run: Run, step: str, logs: list[tuple[str, str]]) -> None:
        for level, message in logs:
            db.add(RunLog(run_id=run.id, level=level, step=step, message=message))
        db.commit()
