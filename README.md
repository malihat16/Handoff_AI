# Handoff AI

A configurable AI workflow-automation platform. It ingests e-mails and invoices (text or PDF), uses an LLM to classify and extract structured data, applies business rules, asks a human for approval when needed, updates downstream systems, and reports on results.

Two workflows ship out of the box, defined in [`workflows.json`](workflows.json):

| Workflow | Steps |
|---|---|
| `email_to_crm` | classify e-mail → upsert CRM contact → hold complaints for review → create prioritised task → notify |
| `invoice_to_approval` | extract fields → validate → block duplicates → save → approval if total > 1,000 or low confidence → notify |

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.asgi:app --reload   # http://localhost:8000
pytest                          # 33 tests
```

Click **Load demo data** in the dashboard to run sample e-mails and invoices. Upload `samples/pdf/palm_logistics_invoice.pdf` to try PDF extraction.

- **Docker (Postgres + app):** `docker compose up --build`
- **Real LLM:** `export ANTHROPIC_API_KEY=...` (optional `LLM_MODEL`). Without a key, a deterministic heuristic engine is used, so it runs offline and tests are reproducible.

## Architecture

```
 e-mail / PDF / webhook ──► FastAPI ──► Engine (app/engine.py) ──► SQLAlchemy (SQLite / Postgres)
                                          • runs steps from workflows.json
 React dashboard ◄────────────────        • retries, pause/resume, per-step logs
                                          └► Steps (app/steps.py) ► LLM layer (Claude ⇄ heuristic fallback)
```

## Key design decisions

- **Workflows are data, not code.** Ordered steps plus parameters in JSON; unknown steps are rejected at startup.
- **Reliable by default.** Permanent errors fail fast, transient ones retry with exponential backoff. Failed steps roll back, runs can resume from the failed step, and steps are idempotent.
- **Duplicate prevention.** Identical inputs return the existing run; the same invoice number from the same vendor is caught by the validator.
- **Human in the loop.** Declarative approval conditions (`gt`, `lt`, `in`, `eq`); pending invoices are saved first so duplicates are blocked while waiting.
- **Guarding against LLM mistakes.** Sender e-mails are parsed deterministically, and extracted invoice numbers and totals must appear in the source text, otherwise confidence drops to 0.3 and a human reviews it. Documents are treated as untrusted input, and API errors fall back to the heuristic engine.
- **Security basics.** Optional `API_KEY`, upload limits, non-root container, React-escaped output.

## API

Docs at `/docs`.

```bash
# submit text
curl -X POST localhost:8000/api/runs -H 'content-type: application/json' \
  -d '{"workflow":"email_to_crm","text":"From: Jo <jo@acme.com>\nSubject: Quote please\n\nPricing for 20 users?"}'

# submit a PDF
curl -X POST localhost:8000/api/runs/upload -F workflow=invoice_to_approval -F file=@samples/pdf/palm_logistics_invoice.pdf

# approve / reject / retry
curl -X POST localhost:8000/api/runs/7/approve -H 'content-type: application/json' -d '{"approver":"hammad"}'
curl -X POST localhost:8000/api/runs/7/reject
curl -X POST localhost:8000/api/runs/9/retry
```

Also: `GET /api/runs`, `/api/stats`, `/api/reports/daily`, `/api/data/{contacts|tasks|invoices|notifications}`, `/api/workflows`, `/api/health`, and `POST /api/webhooks/{workflow}` for n8n/Zapier. Set `DAILY_REPORT_HOUR_UTC` to queue a daily report.

## Adding a workflow

1. Write a step in `app/steps.py` (`fn(ctx, params)`, raise `PermanentError` for non-retryable problems) and register it in `STEPS`.
2. Add a workflow to `workflows.json`. It shows up in the dashboard and API immediately.

## Frontend

React 18 + TypeScript (Vite) in `frontend/`. The built output is committed in `app/static`, so running the Python app needs no Node. To work on the UI: `cd frontend && npm install && npm run dev`, then `npm run build`.

## Limitations / next steps

- Notifications are an outbox table (Slack/e-mail delivery is stubbed).
- The "CRM" is a local table; swap `upsert_contact` for a real HubSpot/Salesforce call.
- Runs execute in-request; production would use a queue (Celery/RQ).
- "Hours saved" is an estimate from `minutes_saved` in `workflows.json`.
- PDFs must contain text; scanned files would need OCR.
