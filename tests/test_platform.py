"""Engine reliability, auth, reporting and the LLM adapter."""
from types import SimpleNamespace

import pytest

from conftest import make_client, sample, submit
from app.llm import AnthropicLLM, HeuristicLLM
from app.steps import PermanentError, STEPS


# ----------------------------------------------------------------- retries
def flaky_workflows():
    return {"flaky": {"description": "t", "minutes_saved": 10,
                      "steps": [{"step": "flaky"}, {"step": "notify", "params": {"message": "done {{run_id}}"}}]}}


def test_transient_failures_are_retried_with_backoff_then_succeed():
    calls = {"n": 0}

    def flaky(ctx, params):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("upstream timeout")

    with make_client(steps={**STEPS, "flaky": flaky}, workflows=flaky_workflows()) as c:
        run = submit(c, "flaky", "hello")["run"]
        assert run["status"] == "completed"
        assert run["attempts"] == 2 and calls["n"] == 3
        logs = c.get(f"/api/runs/{run['id']}").json()["logs"]
        assert sum(1 for log in logs if log["level"] == "warning") == 2


def test_failure_after_max_retries_then_manual_retry_resumes_at_failed_step():
    state = {"healthy": False, "calls": 0}

    def flaky(ctx, params):
        state["calls"] += 1
        if not state["healthy"]:
            raise TimeoutError("still down")

    with make_client(steps={**STEPS, "flaky": flaky}, workflows=flaky_workflows()) as c:
        run = submit(c, "flaky", "hello")["run"]
        assert run["status"] == "failed" and state["calls"] == 3  # max_retries = 3
        assert c.post(f"/api/runs/{run['id']}/approve").status_code == 409

        state["healthy"] = True
        retried = c.post(f"/api/runs/{run['id']}/retry").json()
        assert retried["status"] == "completed"
        assert len(c.get("/api/data/notifications").json()) == 1  # no duplicate side effects
        assert c.post(f"/api/runs/{run['id']}/retry").status_code == 409


def test_permanent_errors_are_not_retried():
    calls = {"n": 0}

    def bad(ctx, params):
        calls["n"] += 1
        raise PermanentError("nope")

    wf = {"w": {"steps": [{"step": "bad"}]}}
    with make_client(steps={**STEPS, "bad": bad}, workflows=wf) as c:
        run = submit(c, "w", "x")["run"]
        assert run["status"] == "failed" and calls["n"] == 1


def test_failed_step_rolls_back_partial_writes():
    def half_done(ctx, params):
        from app.db import Task
        ctx.db.add(Task(run_id=ctx.run.id, title="partial"))
        ctx.db.flush()
        raise PermanentError("boom after writing")

    wf = {"w": {"steps": [{"step": "half_done"}]}}
    with make_client(steps={**STEPS, "half_done": half_done}, workflows=wf) as c:
        assert submit(c, "w", "x")["run"]["status"] == "failed"
        assert c.get("/api/data/tasks").json() == []


def test_unknown_step_in_config_is_rejected_at_startup():
    with pytest.raises(ValueError, match="unknown step"):
        make_client(workflows={"w": {"steps": [{"step": "does_not_exist"}]}})


# ----------------------------------------------------------------- stats & reports
def test_stats_and_daily_report(client):
    submit(client, "email_to_crm", sample("emails", "01_sales_inquiry.txt"))           # completed, 6 min
    submit(client, "invoice_to_approval", sample("invoices", "01_office_supplies.txt"))  # completed, 15 min
    submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))    # awaiting
    submit(client, "invoice_to_approval", sample("invoices", "04_bad_totals.txt"))       # failed

    stats = client.get("/api/stats").json()
    t = stats["totals"]
    assert (t["runs"], t["completed"], t["failed"], t["awaiting_approval"]) == (4, 2, 1, 1)
    assert t["success_rate"] == pytest.approx(66.7)
    assert t["hours_saved"] == pytest.approx(0.35)  # (6 + 15) / 60
    assert stats["by_workflow"]["invoice_to_approval"]["runs"] == 3
    assert stats["last_7_days"][-1]["runs"] == 4 and len(stats["last_7_days"]) == 7

    report = client.get("/api/reports/daily").json()
    assert report["runs"] == 4 and report["tasks_created"] == 1
    assert report["invoice_totals"] == {"AED": pytest.approx(13020.0)}
    assert {a["status"] for a in report["needs_attention"]} == {"failed", "awaiting_approval"}
    assert "# Handoff daily report" in report["markdown"]

    client.post("/api/reports/daily/send")
    channels = [n["channel"] for n in client.get("/api/data/notifications").json()]
    assert "email" in channels


def test_demo_seed_is_idempotent(client):
    first = client.post("/api/demo/seed").json()
    assert first["submitted"] == 10 and first["new"] == 10
    statuses = {r["file"]: r["status"] for r in first["runs"]}
    assert statuses["03_complaint.txt"] == "awaiting_approval"
    assert statuses["02_cloud_hosting.txt"] == "awaiting_approval"
    assert statuses["03_cloud_hosting_resent.txt"] == "failed"
    second = client.post("/api/demo/seed").json()
    assert second["new"] == 2 and second["duplicates"] == 8  # only the 2 failed runs are re-executed


# ----------------------------------------------------------------- auth & misc
def test_api_key_protects_api_but_not_health_or_dashboard():
    with make_client(settings={"api_key": "s3cret"}) as c:
        assert c.get("/api/health").json()["auth_required"] is True
        assert c.get("/api/stats").status_code == 401
        assert c.get("/api/stats", headers={"X-API-Key": "wrong"}).status_code == 401
        assert c.get("/api/stats", headers={"X-API-Key": "s3cret"}).status_code == 200
        assert c.get("/").status_code == 200


def test_webhook_endpoint_for_n8n(client):
    r = client.post("/api/webhooks/email_to_crm",
                    json={"text": sample("emails", "04_partnership.txt"), "source": "n8n"})
    assert r.status_code == 201 and r.json()["run"]["source"] == "n8n"


def test_workflow_catalogue(client):
    names = {w["name"]: w for w in client.get("/api/workflows").json()}
    assert set(names) == {"email_to_crm", "invoice_to_approval"}
    assert names["invoice_to_approval"]["steps"][0] == "extract_invoice"


# ----------------------------------------------------------------- Claude adapter (stubbed client)
def fake_client(text=None, error=None):
    def create(**kwargs):
        if error:
            raise error
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])

    return SimpleNamespace(messages=SimpleNamespace(create=create))


def test_claude_email_classification_keeps_sender_deterministic():
    reply = '```json\n{"intent":"sales_inquiry","priority":"high","summary":"Wants a demo","confidence":0.93,' \
            '"sender_email":"attacker@evil.example"}\n```'
    llm = AnthropicLLM(client=fake_client(reply), model="m")
    out = llm.classify_email(sample("emails", "01_sales_inquiry.txt"))
    assert out["intent"] == "sales_inquiry" and out["priority"] == "high"
    assert out["confidence"] == 0.93 and out["provider"] == "anthropic:m"
    assert out["sender_email"] == "layla.haddad@brightpath-clinic.ae"  # never taken from the model


def test_claude_invoice_extraction_is_grounded():
    text = sample("invoices", "02_cloud_hosting.txt")
    good = ('{"vendor":"Skyline Cloud Hosting FZ-LLC","invoice_number":"sch-2026-0917","issue_date":"2026-09-17",'
            '"due_date":"2026-10-17","currency":"aed","subtotal":12000,"tax":600,"total":12600,"confidence":0.95}')
    out = AnthropicLLM(client=fake_client(good)).extract_invoice(text)
    assert out["invoice_number"] == "SCH-2026-0917" and out["currency"] == "AED"
    assert out["confidence"] == 0.95 and "grounding_failed" not in out

    hallucinated = good.replace("12600", "99999").replace("12000", "99000")
    out = AnthropicLLM(client=fake_client(hallucinated)).extract_invoice(text)
    assert out["grounding_failed"] is True and out["confidence"] <= 0.3


def test_hallucinated_invoice_is_routed_to_human_even_when_small():
    text = sample("invoices", "01_office_supplies.txt")
    wrong = ('{"vendor":"Gulf Office Supplies LLC","invoice_number":"GOS-10482","issue_date":"2026-10-01",'
             '"currency":"AED","subtotal":null,"tax":null,"total":42,"confidence":0.9}')
    from app.main import create_app
    from fastapi.testclient import TestClient
    from conftest import BASE_SETTINGS

    app = create_app(settings=BASE_SETTINGS, llm=AnthropicLLM(client=fake_client(wrong)), backoff=0)
    with TestClient(app) as c:
        run = submit(c, "invoice_to_approval", text)["run"]
        assert run["status"] == "awaiting_approval"
        assert "invoice.confidence" in run["approval_reason"]


def test_claude_failures_fall_back_to_heuristics():
    llm = AnthropicLLM(client=fake_client(error=RuntimeError("API down")))
    out = llm.extract_invoice(sample("invoices", "01_office_supplies.txt"))
    assert out["total"] == 420.0 and out["provider"] == "heuristic"
    assert "API down" in out["fallback_reason"]

    out = AnthropicLLM(client=fake_client("not json at all")).classify_email(
        sample("emails", "04_partnership.txt"))
    assert out["intent"] == "partnership" and "fallback_reason" in out


def test_heuristic_handles_trailing_currency_and_commas():
    out = HeuristicLLM().extract_invoice(
        "Vendor: Test Co\nInvoice Number: T-100\nDate: 2026-01-02\nSubtotal 1,000.00 AED\n"
        "VAT 5% 50.00 AED\nTotal 1,050.00 AED")
    assert (out["total"], out["subtotal"], out["tax"], out["currency"]) == (1050.0, 1000.0, 50.0, "AED")


# ----------------------------------------------------------------- route timeline, headline, search
def test_timeline_follows_the_run_through_approval(client):
    run = submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))["run"]
    states = {s["name"]: s["status"] for s in run["timeline"]}
    assert states == {"extract_invoice": "done", "validate_invoice": "done", "save_invoice": "done",
                      "require_approval": "waiting", "finalize_invoice": "pending", "notify": "pending"}
    assert run["headline"] == {"kind": "invoice", "title": "Skyline Cloud Hosting FZ-LLC",
                               "subtitle": "Invoice SCH-2026-0917", "amount": "AED 12,600.00"}

    done = client.post(f"/api/runs/{run['id']}/approve", json={"approver": "cfo"}).json()
    assert all(s["status"] == "done" and s["ms"] is not None for s in done["timeline"])


def test_timeline_marks_the_failed_step_and_the_rejected_step(client):
    bad = submit(client, "invoice_to_approval", sample("invoices", "04_bad_totals.txt"))["run"]
    states = [(s["name"], s["status"]) for s in bad["timeline"]]
    assert states[:3] == [("extract_invoice", "done"), ("validate_invoice", "failed"), ("save_invoice", "pending")]

    held = submit(client, "email_to_crm", sample("emails", "03_complaint.txt"))["run"]
    assert held["headline"]["kind"] == "email" and held["headline"]["intent"] == "complaint"
    rejected = client.post(f"/api/runs/{held['id']}/reject").json()
    assert [s["status"] for s in rejected["timeline"]][2] == "rejected"


def test_retries_are_recorded_on_the_step():
    calls = {"n": 0}

    def flaky(ctx, params):
        calls["n"] += 1
        if calls["n"] < 3:
            raise ConnectionError("blip")

    with make_client(steps={**STEPS, "flaky": flaky}, workflows=flaky_workflows()) as c:
        run = submit(c, "flaky", "hello")["run"]
        assert run["timeline"][0]["retries"] == 2


def test_run_search_by_text_and_id(client):
    a = submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))["run"]
    submit(client, "email_to_crm", sample("emails", "01_sales_inquiry.txt"))
    assert [r["id"] for r in client.get("/api/runs", params={"q": "skyline"}).json()] == [a["id"]]
    assert [r["id"] for r in client.get("/api/runs", params={"q": f"#{a['id']}"}).json()] == [a["id"]]
    assert client.get("/api/runs", params={"q": "no-such-text"}).json() == []
    assert len(client.get("/api/runs", params={"q": "100%_"}).json()) == 0  # wildcards are escaped


def test_daily_hours_saved_series(client):
    submit(client, "invoice_to_approval", sample("invoices", "01_office_supplies.txt"))
    today = client.get("/api/stats").json()["last_7_days"][-1]
    assert today["hours_saved"] == pytest.approx(0.25)


def test_blocked_duplicate_is_labelled_and_not_counted_as_failure(client):
    submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))
    dup = submit(client, "invoice_to_approval", sample("invoices", "03_cloud_hosting_resent.txt"))["run"]
    assert dup["status"] == "failed" and dup["blocked"] == "duplicate"
    t = client.get("/api/stats").json()["totals"]
    assert t["failed"] == 0 and t["blocked"] == 1 and t["success_rate"] is None
    attention = client.get("/api/reports/daily").json()["needs_attention"]
    assert all(a["run_id"] != dup["id"] for a in attention)
