from conftest import sample, submit


# ----------------------------------------------------------------- email_to_crm
def test_sales_email_completes_and_updates_crm(client):
    body = submit(client, "email_to_crm", sample("emails", "01_sales_inquiry.txt"))
    run = body["run"]
    assert body["duplicate"] is False
    assert run["status"] == "completed"

    detail = client.get(f"/api/runs/{run['id']}").json()
    cls = detail["data"]["classification"]
    assert cls["intent"] == "sales_inquiry"
    assert cls["sender_email"] == "layla.haddad@brightpath-clinic.ae"
    assert cls["company"] == "BrightPath Clinics"

    contacts = client.get("/api/data/contacts").json()
    assert [c["email"] for c in contacts] == ["layla.haddad@brightpath-clinic.ae"]
    tasks = client.get("/api/data/tasks").json()
    assert len(tasks) == 1 and tasks[0]["title"].startswith("[sales_inquiry]")
    assert len(client.get("/api/data/notifications").json()) == 1


def test_urgent_support_email_gets_high_priority_task_immediately(client):
    run = submit(client, "email_to_crm", sample("emails", "02_support_urgent.txt"))["run"]
    assert run["status"] == "completed"
    cls = client.get(f"/api/runs/{run['id']}").json()["data"]["classification"]
    assert cls["intent"] == "support_request" and cls["priority"] == "high"
    assert client.get("/api/data/tasks").json()[0]["priority"] == "high"


def test_other_sample_emails_are_classified_sensibly(client):
    expected = {
        "03_complaint.txt": "complaint",
        "04_partnership.txt": "partnership",
        "05_billing_refund.txt": "billing",
    }
    for name, intent in expected.items():
        run = submit(client, "email_to_crm", sample("emails", name))["run"]
        detail = client.get(f"/api/runs/{run['id']}").json()
        assert detail["data"]["classification"]["intent"] == intent, name


def test_complaint_waits_for_approval_then_creates_task(client):
    run = submit(client, "email_to_crm", sample("emails", "03_complaint.txt"))["run"]
    assert run["status"] == "awaiting_approval"
    assert "Complaints" in run["approval_reason"]
    assert client.get("/api/data/tasks").json() == []  # nothing happens before approval
    assert len(client.get("/api/data/contacts").json()) == 1  # CRM update is safe, done already

    done = client.post(f"/api/runs/{run['id']}/approve",
                       json={"approver": "hammad", "comment": "ok"}).json()
    assert done["status"] == "completed" and done["approved_by"] == "hammad"
    assert len(client.get("/api/data/tasks").json()) == 1


def test_rejected_complaint_creates_no_task(client):
    run = submit(client, "email_to_crm", sample("emails", "03_complaint.txt"))["run"]
    rejected = client.post(f"/api/runs/{run['id']}/reject", json={"approver": "mgr"}).json()
    assert rejected["status"] == "rejected"
    assert client.get("/api/data/tasks").json() == []
    # cannot decide twice
    assert client.post(f"/api/runs/{run['id']}/approve").status_code == 409


def test_email_without_sender_fails_permanently_without_retries(client):
    run = submit(client, "email_to_crm", "Subject: hello\n\nNo sender anywhere in here.")["run"]
    assert run["status"] == "failed"
    assert "sender" in run["error"].lower()
    assert run["attempts"] == 0  # permanent errors are not retried


def test_existing_contact_is_updated_not_duplicated(client):
    submit(client, "email_to_crm", sample("emails", "01_sales_inquiry.txt"))
    again = sample("emails", "01_sales_inquiry.txt").replace("Pricing and demo", "Follow-up on demo")
    submit(client, "email_to_crm", again)
    contacts = client.get("/api/data/contacts").json()
    assert len(contacts) == 1 and contacts[0]["interactions"] == 2


# ----------------------------------------------------------------- duplicates
def test_identical_resubmission_returns_existing_run(client):
    text = sample("emails", "01_sales_inquiry.txt")
    first = submit(client, "email_to_crm", text)
    second = submit(client, "email_to_crm", "  " + text.replace("\n", "\n\n") + "  ")
    assert second["duplicate"] is True
    assert second["run"]["id"] == first["run"]["id"]
    assert len(client.get("/api/data/tasks").json()) == 1


# ----------------------------------------------------------------- invoice_to_approval
def test_small_invoice_is_auto_approved(client):
    run = submit(client, "invoice_to_approval", sample("invoices", "01_office_supplies.txt"))["run"]
    assert run["status"] == "completed"
    inv = client.get("/api/data/invoices").json()[0]
    assert (inv["vendor"], inv["invoice_number"], inv["currency"], inv["total"]) == (
        "Gulf Office Supplies LLC", "GOS-10482", "AED", 420.0)
    assert inv["issue_date"] == "2026-10-01" and inv["due_date"] == "2026-10-31"
    assert inv["status"] == "approved" and inv["approved_by"] == "auto"


def test_large_invoice_requires_approval(client):
    run = submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))["run"]
    assert run["status"] == "awaiting_approval"
    inv = client.get("/api/data/invoices").json()[0]
    assert inv["total"] == 12600.0 and inv["status"] == "pending_approval"
    assert inv["issue_date"] == "2026-09-17"

    done = client.post(f"/api/runs/{run['id']}/approve", json={"approver": "cfo"}).json()
    assert done["status"] == "completed"
    inv = client.get("/api/data/invoices").json()[0]
    assert inv["status"] == "approved" and inv["approved_by"] == "cfo"


def test_rejecting_invoice_marks_it_rejected_and_frees_the_number(client):
    text = sample("invoices", "02_cloud_hosting.txt")
    run = submit(client, "invoice_to_approval", text)["run"]
    client.post(f"/api/runs/{run['id']}/reject", json={"approver": "cfo"})
    assert client.get("/api/data/invoices").json()[0]["status"] == "rejected"
    # the same invoice can be re-submitted afterwards
    again = submit(client, "invoice_to_approval", text)
    assert again["duplicate"] is False and again["run"]["status"] == "awaiting_approval"


def test_same_invoice_in_different_layout_is_caught_as_duplicate(client):
    submit(client, "invoice_to_approval", sample("invoices", "02_cloud_hosting.txt"))
    run = submit(client, "invoice_to_approval", sample("invoices", "03_cloud_hosting_resent.txt"))["run"]
    assert run["status"] == "failed"
    assert run["error"].startswith("DuplicateInvoice")
    assert len(client.get("/api/data/invoices").json()) == 1


def test_inconsistent_totals_are_rejected_by_validation(client):
    run = submit(client, "invoice_to_approval", sample("invoices", "04_bad_totals.txt"))["run"]
    assert run["status"] == "failed" and "do not add up" in run["error"]
    assert client.get("/api/data/invoices").json() == []


def test_usd_symbol_and_us_date_format(client):
    run = submit(client, "invoice_to_approval", sample("invoices", "05_usd_software.txt"))["run"]
    assert run["status"] == "completed"
    inv = client.get("/api/data/invoices").json()[0]
    assert inv["currency"] == "USD" and inv["total"] == 249.0
    assert inv["issue_date"] == "2026-10-03" and inv["due_date"] == "2026-11-02"


def test_invoice_with_missing_fields_fails_validation(client):
    run = submit(client, "invoice_to_approval", "Some random note\nnothing useful here")["run"]
    assert run["status"] == "failed" and "Missing required invoice fields" in run["error"]


# ----------------------------------------------------------------- uploads
def test_pdf_upload_runs_invoice_workflow(client):
    from conftest import SAMPLES

    pdf = (SAMPLES / "pdf" / "palm_logistics_invoice.pdf").read_bytes()
    r = client.post("/api/runs/upload", data={"workflow": "invoice_to_approval"},
                    files={"file": ("palm.pdf", pdf, "application/pdf")})
    assert r.status_code == 201, r.text
    assert r.json()["run"]["status"] == "awaiting_approval"  # 3,780 > 1,000
    inv = client.get("/api/data/invoices").json()[0]
    assert (inv["vendor"], inv["invoice_number"], inv["total"]) == ("Palm Logistics FZCO", "PL-2026-0455", 3780.0)


def test_upload_rejects_unsupported_type(client):
    r = client.post("/api/runs/upload", data={"workflow": "invoice_to_approval"},
                    files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415


def test_unknown_workflow_is_404_and_empty_input_is_422(client):
    assert client.post("/api/runs", json={"workflow": "nope", "text": "x"}).status_code == 404
    assert client.post("/api/runs", json={"workflow": "email_to_crm", "text": "   "}).status_code == 422
