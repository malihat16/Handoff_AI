"""Step library. Workflows (workflows.json) are just ordered lists of these steps.

Contract: a step is `fn(ctx, params) -> None | Pause`.
* raise PermanentError (or a subclass) -> fail immediately, no retry (bad input, duplicates)
* raise anything else                  -> treated as transient and retried with backoff
* return Pause(reason)                 -> run waits for a human decision
Steps are idempotent so a retry or a resume never creates duplicate records.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Contact, Invoice, Notification, Run, Task, utcnow
from .llm import CURRENCIES, normalise_vendor


class PermanentError(Exception):
    """Non-retryable failure."""


class ValidationFailed(PermanentError):
    pass


class DuplicateInvoice(PermanentError):
    pass


@dataclass
class Pause:
    reason: str


@dataclass
class Context:
    db: Session
    run: Run
    data: dict
    llm: Any
    approved_by: str | None = None
    logs: list[tuple[str, str]] = field(default_factory=list)

    def log(self, level: str, message: str) -> None:
        self.logs.append((level, message))


# --------------------------------------------------------------------------- helpers
def get_path(data: Any, path: str, default: Any = None) -> Any:
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur


def render(template: str, data: dict) -> str:
    def sub(m: re.Match) -> str:
        value = get_path(data, m.group(1))
        return "" if value is None else str(value)

    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", sub, template)


def _condition_hit(cond: dict, data: dict) -> str | None:
    if cond.get("always"):
        return "always requires approval"
    field_name = cond.get("field", "")
    value = get_path(data, field_name)
    if value is None:
        return None
    try:
        if "gt" in cond and float(value) > float(cond["gt"]):
            return f"{field_name}={value} > {cond['gt']}"
        if "lt" in cond and float(value) < float(cond["lt"]):
            return f"{field_name}={value} < {cond['lt']}"
    except (TypeError, ValueError):
        return None
    if "in" in cond and value in cond["in"]:
        return f"{field_name}={value}"
    if "eq" in cond and value == cond["eq"]:
        return f"{field_name}={value}"
    return None


# --------------------------------------------------------------------------- AI steps
def classify_email(ctx: Context, params: dict) -> None:
    result = ctx.llm.classify_email(ctx.run.input_text)
    ctx.data["classification"] = result
    note = f" (fallback: {result['fallback_reason']})" if result.get("fallback_reason") else ""
    ctx.log("info", f"Classified as {result['intent']} / {result['priority']} priority via "
                    f"{result['provider']}, confidence {result['confidence']}{note}")


def extract_invoice(ctx: Context, params: dict) -> None:
    result = ctx.llm.extract_invoice(ctx.run.input_text)
    ctx.data["invoice"] = result
    note = f" (fallback: {result['fallback_reason']})" if result.get("fallback_reason") else ""
    grounding = " - values NOT found in source text" if result.get("grounding_failed") else ""
    ctx.log("info", f"Extracted invoice fields via {result['provider']}, "
                    f"confidence {result['confidence']}{note}{grounding}")


# --------------------------------------------------------------------------- validation
def validate_invoice(ctx: Context, params: dict) -> None:
    inv = ctx.data.get("invoice") or {}
    missing = [k for k in ("vendor", "invoice_number", "total", "currency") if not inv.get(k)]
    if missing:
        raise ValidationFailed(f"Missing required invoice fields: {', '.join(missing)}")
    if inv["total"] <= 0:
        raise ValidationFailed(f"Invoice total must be positive (got {inv['total']})")
    if inv["currency"] not in CURRENCIES:
        raise ValidationFailed(f"Unsupported currency '{inv['currency']}'")
    if inv.get("subtotal") is not None and inv.get("tax") is not None:
        if abs(inv["subtotal"] + inv["tax"] - inv["total"]) > 0.01:
            raise ValidationFailed(
                f"Totals do not add up: {inv['subtotal']} + {inv['tax']} != {inv['total']}")
    dup = ctx.db.scalar(
        select(Invoice).where(
            Invoice.vendor_norm == normalise_vendor(inv["vendor"]),
            Invoice.invoice_number == inv["invoice_number"],
            Invoice.status != "rejected",
            Invoice.run_id != ctx.run.id,
        )
    )
    if dup:
        raise DuplicateInvoice(
            f"Duplicate of invoice {dup.invoice_number} from {dup.vendor} (run #{dup.run_id})")
    ctx.log("info", "Invoice passed validation and duplicate check")


# --------------------------------------------------------------------------- control flow
def require_approval(ctx: Context, params: dict) -> Pause | None:
    hits = [h for c in params.get("conditions", []) if (h := _condition_hit(c, ctx.data))]
    if not hits:
        ctx.log("info", "No approval needed; continuing automatically")
        return None
    reason = f"{params.get('reason', 'Human approval required')} [{'; '.join(hits)}]"
    ctx.log("info", f"Paused for approval: {reason}")
    return Pause(reason)


# --------------------------------------------------------------------------- integration steps
def upsert_contact(ctx: Context, params: dict) -> None:
    c = ctx.data.get("classification") or {}
    email = c.get("sender_email")
    if not email:
        raise ValidationFailed("No sender e-mail address found in the message")
    contact = ctx.db.scalar(select(Contact).where(Contact.email == email))
    if contact is None:
        contact = Contact(email=email, name=c.get("sender_name"), company=c.get("company"),
                          last_intent=c.get("intent"), last_run_id=ctx.run.id)
        ctx.db.add(contact)
        ctx.log("info", f"Created CRM contact {email}")
    else:
        if contact.last_run_id != ctx.run.id:
            contact.interactions += 1
        contact.name = c.get("sender_name") or contact.name
        contact.company = c.get("company") or contact.company
        contact.last_intent = c.get("intent")
        contact.last_seen = utcnow()
        contact.last_run_id = ctx.run.id
        ctx.log("info", f"Updated CRM contact {email} ({contact.interactions} interactions)")
    ctx.db.flush()
    ctx.data["contact_id"] = contact.id


def create_task(ctx: Context, params: dict) -> None:
    if ctx.db.scalar(select(Task).where(Task.run_id == ctx.run.id)):
        ctx.log("info", "Task already exists for this run; skipping")
        return
    c = ctx.data.get("classification") or {}
    title = render(params.get("title", "{{classification.summary}}"), ctx.data)[:200]
    description = (f"From {c.get('sender_name')} <{c.get('sender_email')}> "
                   f"({c.get('company') or 'unknown company'})\n\n{ctx.run.input_text[:1000]}")
    priority = get_path(ctx.data, params.get("priority_field", ""), "normal")
    task = Task(run_id=ctx.run.id, title=title, description=description,
                priority=priority if priority in ("low", "normal", "high") else "normal")
    ctx.db.add(task)
    ctx.log("info", f"Created {task.priority}-priority task: {title}")


def save_invoice(ctx: Context, params: dict) -> None:
    if ctx.db.scalar(select(Invoice).where(Invoice.run_id == ctx.run.id)):
        ctx.log("info", "Invoice already saved for this run; skipping")
        return
    inv = ctx.data["invoice"]
    ctx.db.add(Invoice(
        run_id=ctx.run.id, vendor=inv["vendor"], vendor_norm=normalise_vendor(inv["vendor"]),
        invoice_number=inv["invoice_number"], issue_date=inv.get("issue_date"),
        due_date=inv.get("due_date"), currency=inv["currency"], subtotal=inv.get("subtotal"),
        tax=inv.get("tax"), total=inv["total"], status="pending_approval"))
    ctx.log("info", f"Saved invoice {inv['invoice_number']} ({inv['currency']} {inv['total']:,.2f})")


def finalize_invoice(ctx: Context, params: dict) -> None:
    inv = ctx.db.scalar(select(Invoice).where(Invoice.run_id == ctx.run.id))
    if inv is None:
        raise PermanentError("No saved invoice found for this run")
    inv.status = "approved"
    inv.approved_by = ctx.approved_by or "auto"
    ctx.log("info", f"Invoice approved by {inv.approved_by}")


def notify(ctx: Context, params: dict) -> None:
    message = render(params.get("message", "Run {{run_id}} finished"),
                     {**ctx.data, "run_id": ctx.run.id})
    ctx.db.add(Notification(run_id=ctx.run.id, channel=params.get("channel", "slack"),
                            message=message))
    ctx.log("info", f"Queued {params.get('channel', 'slack')} notification")


STEPS = {
    "classify_email": classify_email,
    "extract_invoice": extract_invoice,
    "validate_invoice": validate_invoice,
    "require_approval": require_approval,
    "upsert_contact": upsert_contact,
    "create_task": create_task,
    "save_invoice": save_invoice,
    "finalize_invoice": finalize_invoice,
    "notify": notify,
}
