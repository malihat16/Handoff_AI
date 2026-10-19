# Handoff AI

A configurable AI workflow-automation platform. It ingests e-mails and invoices (text or PDF), uses an LLM to
classify and extract structured data, applies business rules, asks a human for approval when needed, updates
downstream systems (CRM, invoice ledger, task list, notifications) and reports on the results.

Two complete workflows ship out of the box, defined in [`workflows.json`](workflows.json):

| Workflow | What it does |
|---|---|
| `email_to_crm` | classify e-mail → upsert CRM contact → **hold complaints for human review** → create prioritised task → notify |
| `invoice_to_approval` | extract fields → validate (required fields, arithmetic, currency) → block duplicates → save → **approval if total > 1,000 or low confidence** → mark approved → notify |

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.asgi:app --reload        # open http://localhost:8000
pytest                               # 33 tests
```

Click **Load demo data** in the dashboard: it runs 5 sample e-mails and 5 sample invoices, leaving approvals
waiting, a duplicate invoice caught and a bad invoice failed, so every feature has something to show.
Upload `samples/pdf/palm_logistics_invoice.pdf` to see PDF extraction.

**With Docker (Postgres + app):** `docker compose up --build` → http://localhost:8000

**With a real LLM:** `export ANTHROPIC_API_KEY=...` (optional `LLM_MODEL`). Without a key, a deterministic
heuristic engine is used, so the project always runs offline and tests are reproducible.

## Architecture

```
  e-mail text / PDF / webhook (n8n)          ┌────────────────────────────────────┐
  ───────────────────────────────►  FastAPI  │  Engine (app/engine.py)            │
                                      API    │   • dedup by content hash          │
                                             │   • runs steps from workflows.json │
 Dashboard (React SPA, app/static) ◄─────┘       │   • retry + exponential backoff    │
                                             │   • pause/resume for approvals     │
        Step library (app/steps.py)  ◄───────┤   • per-step logs, durations       │
        classify · extract · validate        └──────────────┬─────────────────────┘
        approve · upsert · task · notify                    │
                       │                                    ▼
              LLM layer (app/llm.py)               SQLAlchemy → SQLite / PostgreSQL
              Claude API  ⇄  heuristic fallback    runs · logs · contacts · tasks · invoices · notifications
```

### Design decisions worth talking about

- **Workflows are data, not code.** A workflow is an ordered list of registered steps plus parameters
  (approval thresholds, templates). Changing the invoice threshold or adding a notification is a JSON edit.
  Unknown steps are rejected at startup.
- **Reliability.** Steps raising `PermanentError` (bad input, duplicates) fail fast; anything else is treated as
  transient and retried with exponential backoff. A failed step is rolled back, so no partial writes. Run state is
  snapshotted after every step, so a failed run can be **resumed from the failed step** and an approval pause
  survives restarts. Steps are idempotent, so retries never create duplicate tasks or invoices.
- **Duplicate prevention at two levels.** Identical inputs (whitespace-insensitive) return the existing run;
  the same invoice number from the same vendor in a *different* layout is caught by the validator.
- **Human in the loop.** Approval conditions are declarative (`gt`, `lt`, `in`, `eq`). Pending invoices are saved
  *before* approval so duplicates are blocked even while waiting; rejecting frees the invoice number again.
- **Defence against LLM mistakes.** The model never supplies identifiers it could invent: sender e-mail is parsed
  deterministically. Invoice numbers and totals returned by the model must literally appear in the source
  document (a "grounding check"), otherwise confidence is capped at 0.3 and the invoice is routed to a human even if
  it is small. Prompts treat documents as untrusted data (prompt-injection aware), and any API/parse error
  falls back to the heuristic engine and is recorded in the run log.
- **Security basics.** Optional `API_KEY` (constant-time compare), upload size/type limits, non-root container,
  dashboard is React, which escapes all e-mail content by default (no raw HTML injection anywhere).

## API (OpenAPI docs at `/docs`)

```bash
# submit text
curl -X POST localhost:8000/api/runs -H 'content-type: application/json' \
  -d '{"workflow":"email_to_crm","text":"From: Jo <jo@acme.com>\nSubject: Quote please\n\nHi, pricing for 20 users?"}'

# submit a PDF
curl -X POST localhost:8000/api/runs/upload -F workflow=invoice_to_approval -F file=@samples/pdf/palm_logistics_invoice.pdf

# approve / reject / retry
curl -X POST localhost:8000/api/runs/7/approve -H 'content-type: application/json' -d '{"approver":"hammad"}'
curl -X POST localhost:8000/api/runs/7/reject
curl -X POST localhost:8000/api/runs/9/retry

# n8n / Zapier: an "HTTP Request" node can POST here
curl -X POST localhost:8000/api/webhooks/email_to_crm -H 'content-type: application/json' -d '{"text":"...","source":"n8n"}'
```

Other endpoints: `GET /api/runs`, `/api/runs/{id}`, `/api/stats`, `/api/reports/daily`,
`POST /api/reports/daily/send`, `/api/data/{contacts|tasks|invoices|notifications}`, `/api/workflows`, `/api/health`.
Set `DAILY_REPORT_HOUR_UTC=5` to queue the daily report automatically every day.

## Adding your own workflow

1. Write a step in `app/steps.py` (`fn(ctx, params)`, raise `PermanentError` for non-retryable problems) and
   register it in `STEPS`.
2. Add a workflow to `workflows.json` using your steps.
3. It appears in the dashboard and API immediately.

## Honest limitations (and what I'd do next)

- **Notifications are an outbox table.** Slack/e-mail delivery is stubbed; wiring real delivery is one step function.
- **The "CRM" is a local table.** Swap `upsert_contact` for a HubSpot/Salesforce REST call to integrate a real one.
- **Runs execute inside the request.** Fine for a demo; production would push runs onto a queue (Celery/RQ) with workers.
- **"Hours saved" is an estimate** from `minutes_saved` in `workflows.json`; it's configuration, not measurement.
- **PDFs must contain text.** Scanned images need an OCR step.
- **Dashboard is React 18 + TypeScript (Vite)**, source in `frontend/`. The built output is committed in `app/static`, so running the Python app needs no Node. To work on the UI: `cd frontend && npm install && npm run dev` (proxies `/api` to localhost:8000), then `npm run build` to refresh `app/static`. `npm test` runs the frontend unit tests.
- The Claude-backed path is covered by tests using a stubbed client; test it with your own key before demoing it live.

## CV bullets (edit to taste)

- Built **Handoff AI**, a configurable workflow-automation platform (Python, FastAPI, SQLAlchemy, PostgreSQL, Docker)
  that turns e-mails and PDF invoices into CRM updates, tasks and approved invoices using LLM classification and extraction.
- Designed a JSON-configured, resumable workflow engine with exponential-backoff retries, transient/permanent error
  handling, idempotent steps, duplicate prevention and human-approval gates.
- Integrated the Claude API with deterministic parsing of identifiers, source-grounding checks on extracted values and
  graceful fallback, so hallucinated invoice data is routed to a human instead of being auto-approved.
- Shipped a management dashboard (success rate, failures, estimated hours saved), automatic daily reports, an
  n8n-compatible webhook, API-key auth, and a 33-test automated suite.
