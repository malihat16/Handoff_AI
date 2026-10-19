"""Dashboard statistics and the automatic daily report."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Invoice, Notification, Run, Task


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _minutes(workflows: dict, name: str) -> int:
    return int(workflows.get(name, {}).get("minutes_saved", 0))


def compute_stats(db: Session, workflows: dict) -> dict:
    rows = db.execute(select(Run.workflow, Run.status, func.count()).group_by(Run.workflow, Run.status))
    by_wf: dict[str, Counter] = defaultdict(Counter)
    totals: Counter = Counter()
    for wf, status, n in rows:
        by_wf[wf][status] += n
        totals[status] += n

    # A resent invoice that the duplicate guard stops is the system working, not a failure.
    dup_rows = db.execute(select(Run.workflow, func.count()).where(
        Run.status == "failed", Run.error.like("DuplicateInvoice%")).group_by(Run.workflow))
    dups: Counter = Counter({wf: n for wf, n in dup_rows})
    blocked_total = sum(dups.values())
    for wf, n in dups.items():
        by_wf[wf]["failed"] -= n
        by_wf[wf]["blocked"] += n
    totals["failed"] -= blocked_total

    finished = totals["completed"] + totals["failed"]
    by_person = db.scalar(select(func.count()).select_from(Run).where(
        Run.status == "completed", Run.approved_by.is_not(None))) or 0
    avg_ms = db.scalar(select(func.avg(Run.duration_ms)).where(Run.status == "completed")) or 0
    minutes = sum(_minutes(workflows, wf) * c["completed"] for wf, c in by_wf.items())

    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    series = {d: Counter() for d in days}
    since = datetime.combine(days[0], datetime.min.time(), tzinfo=timezone.utc)
    for created_at, status, wf in db.execute(
            select(Run.created_at, Run.status, Run.workflow).where(Run.created_at >= since)):
        d = _as_utc(created_at).date()
        if d in series:
            series[d]["runs"] += 1
            series[d][status] += 1
            if status == "completed":
                series[d]["minutes"] += _minutes(workflows, wf)

    return {
        "totals": {
            "runs": sum(totals.values()),
            "completed": totals["completed"],
            "failed": totals["failed"],
            "blocked": blocked_total,
            "decided_by_person": by_person,
            "awaiting_approval": totals["awaiting_approval"],
            "rejected": totals["rejected"],
            "success_rate": round(100 * totals["completed"] / finished, 1) if finished else None,
            "avg_duration_ms": int(avg_ms),
            "hours_saved": round(minutes / 60, 2),
        },
        "by_workflow": {
            wf: {
                "runs": sum(c.values()),
                "completed": c["completed"],
                "failed": c["failed"],
                "blocked": c["blocked"],
                "awaiting_approval": c["awaiting_approval"],
                "hours_saved": round(_minutes(workflows, wf) * c["completed"] / 60, 2),
            }
            for wf, c in by_wf.items()
        },
        "last_7_days": [
            {"date": d.isoformat(), "runs": c["runs"], "completed": c["completed"],
             "failed": c["failed"], "hours_saved": round(c["minutes"] / 60, 2)}
            for d, c in series.items()
        ],
    }


def daily_report(db: Session, workflows: dict, day: date | None = None) -> dict:
    day = day or datetime.now(timezone.utc).date()
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    runs = db.scalars(select(Run).where(Run.created_at >= start, Run.created_at < end)).all()
    counts = Counter(r.status for r in runs)
    minutes = sum(_minutes(workflows, r.workflow) for r in runs if r.status == "completed")
    tasks = db.scalar(select(func.count()).select_from(Task).where(
        Task.created_at >= start, Task.created_at < end)) or 0

    invoice_totals: dict[str, float] = defaultdict(float)
    invoices = db.scalars(select(Invoice).where(
        Invoice.created_at >= start, Invoice.created_at < end, Invoice.status != "rejected")).all()
    for inv in invoices:
        invoice_totals[inv.currency] += inv.total

    attention = [
        {"run_id": r.id, "workflow": r.workflow, "status": r.status,
         "detail": r.error or r.approval_reason}
        for r in db.scalars(select(Run).where(Run.status.in_(("failed", "awaiting_approval")))
                            .order_by(Run.id)).all()
        if not (r.error or "").startswith("DuplicateInvoice")  # blocked duplicates need no action
    ]

    lines = [
        f"# Handoff daily report: {day.isoformat()}",
        "",
        f"- Runs: {len(runs)} (completed {counts['completed']}, failed {counts['failed']} incl. blocked duplicates, "
        f"awaiting approval {counts['awaiting_approval']}, rejected {counts['rejected']})",
        f"- Estimated time saved: {minutes / 60:.2f} h",
        f"- Tasks created: {tasks}",
        f"- Invoices processed: {len(invoices)}"
        + (" (" + ", ".join(f"{cur} {amt:,.2f}" for cur, amt in invoice_totals.items()) + ")"
           if invoices else ""),
    ]
    if attention:
        lines += ["", "## Needs attention"]
        lines += [f"- Run #{a['run_id']} {a['workflow']} [{a['status']}]: {a['detail']}" for a in attention]
    return {
        "date": day.isoformat(),
        "runs": len(runs),
        "by_status": dict(counts),
        "hours_saved": round(minutes / 60, 2),
        "tasks_created": tasks,
        "invoices_processed": len(invoices),
        "invoice_totals": dict(invoice_totals),
        "needs_attention": attention,
        "markdown": "\n".join(lines),
    }


def send_daily_report(db: Session, workflows: dict, day: date | None = None) -> dict:
    report = daily_report(db, workflows, day)
    db.add(Notification(run_id=None, channel="email", message=report["markdown"]))
    db.commit()
    return report
