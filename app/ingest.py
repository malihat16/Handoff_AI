"""Turn an uploaded file into plain text for the workflows."""
from __future__ import annotations

import io

from .engine import EngineError

MAX_BYTES = 5 * 1024 * 1024
TEXT_EXTENSIONS = (".txt", ".eml", ".md", ".csv", ".json", ".log")


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise EngineError("File too large (limit 5 MB)", 413)
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:
            raise EngineError(f"Could not read PDF: {exc}", 422) from exc
        if not text.strip():
            raise EngineError("PDF contains no extractable text (scanned images need OCR)", 422)
        return text
    if name.endswith(TEXT_EXTENSIONS):
        return data.decode("utf-8", errors="replace")
    raise EngineError(f"Unsupported file type: {filename}", 415)
