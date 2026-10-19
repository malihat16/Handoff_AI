FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/handoff

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY samples ./samples
COPY workflows.json .

# run as an unprivileged user; /data holds the SQLite file when no Postgres is configured
RUN useradd --create-home --uid 10001 handoff && mkdir /data && chown handoff /data
USER handoff
ENV DATABASE_URL=sqlite:////data/handoff.db

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

CMD ["uvicorn", "app.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
