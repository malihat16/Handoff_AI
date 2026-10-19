from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

try:  # pick up a local .env file; real environment variables always win
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env", override=False)
except ImportError:  # python-dotenv is optional
    pass


@dataclass(frozen=True)
class Settings:
    database_url: str
    anthropic_api_key: str | None
    llm_model: str
    api_key: str | None
    max_retries: int
    retry_backoff: float
    workflows_path: Path
    daily_report_hour_utc: int | None


def _normalise_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg2://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


def load_settings() -> Settings:
    url = os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'handoff.db'}"
    hour = os.getenv("DAILY_REPORT_HOUR_UTC")
    return Settings(
        database_url=_normalise_db_url(url),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        llm_model=os.getenv("LLM_MODEL", "claude-sonnet-5-5"),
        api_key=os.getenv("API_KEY") or None,
        max_retries=int(os.getenv("MAX_RETRIES", "3")),
        retry_backoff=float(os.getenv("RETRY_BACKOFF_SECONDS", "0.5")),
        workflows_path=Path(os.getenv("WORKFLOWS_PATH", BASE_DIR / "workflows.json")),
        daily_report_hour_utc=int(hour) if hour not in (None, "") else None,
    )


def load_workflows(path: Path) -> dict[str, dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["workflows"]
