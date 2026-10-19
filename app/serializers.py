from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .db import Run


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:  # SQLite returns naive datetimes; everything is stored as UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def step_timeline(run: Run, step_names: list[str]) -> list[dict[str, Any]]:
    """Where the run is on its route: one entry per configured step."""
    state = run.state or {}
    next_step = int(state.get("next_step", 0))
    metrics = state.get("metrics", {})
    out = []
    for i, name in enumerate(step_names):
        m = metrics.get(str(i), {})
        if run.status == "awaiting_approval" and i == next_step - 1:
            status = "waiting"
        elif run.status == "rejected" and i == next_step - 1:
            status = "rejected"
        elif i < next_step:
            status = "done"
        elif i == next_step:
            status = {"failed": "failed", "running": "running"}.get(run.status, "pending")
        else:
            status = "pending"
        out.append({"name": name, "status": status, "ms": m.get("ms"), "retries": m.get("retries", 0)})
    return out


def headline(run: Run) -> dict[str, Any]:
    """A human title for the run, derived from what the AI extracted."""
    data = (run.state or {}).get("data", {})
    inv, cls = data.get("invoice"), data.get("classification")
    if inv and inv.get("vendor"):
        amount = None
        if inv.get("total") is not None and inv.get("currency"):
            amount = f"{inv['currency']} {inv['total']:,.2f}"
        number = inv.get("invoice_number")
        return {"kind": "invoice", "title": inv["vendor"],
                "subtitle": f"Invoice {number}" if number else "Invoice", "amount": amount}
    if cls:
        who = cls.get("sender_name") or cls.get("sender_email") or "Unknown sender"
        company = cls.get("company")
        return {"kind": "email", "title": cls.get("summary") or "Email",
                "subtitle": f"{who}, {company}" if company else who, "amount": None,
                "intent": cls.get("intent"), "priority": cls.get("priority")}
    return {"kind": None, "title": " ".join(run.input_text.split())[:80], "subtitle": run.source,
            "amount": None}


def run_to_dict(run: Run, detail: bool = False, steps: list[str] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": run.id,
        "workflow": run.workflow,
        "source": run.source,
        "status": run.status,
        "error": run.error,
        "blocked": "duplicate" if run.status == "failed" and (run.error or "").startswith("DuplicateInvoice") else None,
        "approval_reason": run.approval_reason,
        "approved_by": run.approved_by,
        "decision_comment": run.decision_comment,
        "attempts": run.attempts,
        "duration_ms": run.duration_ms,
        "created_at": iso(run.created_at),
        "finished_at": iso(run.finished_at),
        "preview": " ".join(run.input_text.split())[:140],
        "headline": headline(run),
        "timeline": step_timeline(run, steps or []),
    }
    if detail:
        out["input_text"] = run.input_text
        out["data"] = (run.state or {}).get("data", {})
        out["next_step"] = (run.state or {}).get("next_step", 0)
        out["logs"] = [
            {"ts": iso(log.ts), "level": log.level, "step": log.step, "message": log.message}
            for log in run.logs
        ]
    return out


def row_to_dict(obj: Any) -> dict[str, Any]:
    out = {}
    for col in obj.__table__.columns:
        value = getattr(obj, col.name)
        out[col.name] = iso(value) if isinstance(value, datetime) else value
    return out
