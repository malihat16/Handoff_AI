import sys
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.llm import HeuristicLLM  # noqa: E402
from app.main import create_app  # noqa: E402

SAMPLES = ROOT / "samples"

BASE_SETTINGS = Settings(
    database_url="sqlite://",
    anthropic_api_key=None,
    llm_model="test",
    api_key=None,
    max_retries=3,
    retry_backoff=0,
    workflows_path=ROOT / "workflows.json",
    daily_report_hour_utc=None,
)


def make_client(**overrides):
    settings = replace(BASE_SETTINGS, **overrides.pop("settings", {}))
    app = create_app(settings=settings, llm=HeuristicLLM(), backoff=0, **overrides)
    return TestClient(app)


@pytest.fixture()
def client():
    with make_client() as c:
        yield c


def sample(kind: str, name: str) -> str:
    return (SAMPLES / kind / name).read_text(encoding="utf-8")


def submit(client, workflow: str, text: str):
    r = client.post("/api/runs", json={"workflow": workflow, "text": text})
    assert r.status_code in (200, 201), r.text
    return r.json()
