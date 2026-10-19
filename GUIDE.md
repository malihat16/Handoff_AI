# Handoff AI: setup and run guide

Time needed: about 10 minutes. You need Python 3.11 or newer. Node.js is only needed if you want to edit the UI.

## 1. Unzip and open a terminal

```
unzip handoff.zip
cd handoff
```

## 2. Run it (no API key needed)

Mac or Linux:
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.asgi:app --port 8000
```

Windows (PowerShell):
```
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.asgi:app --port 8000
```

Open http://localhost:8000. The top bar says "Built-in rules engine". That is the free mode: it reads emails and invoices with rules, no AI key.

## 3. Try the demo (2 minutes)

1. Click **Load demo data**. It runs 5 sample emails and 5 sample invoices.
2. **Overview**: the big number is how many runs are waiting for you. Charts show runs and time saved per day.
3. **Approvals**: pick the Skyline invoice (AED 12,600). Original on the left, what the AI found on the right. Type your name, click **Approve**. Press J or K to move through the queue.
4. Open the complaint email, then **Reject** it with a note.
5. **Runs**: search for "Skyline". Open run #8: it shows **Duplicate blocked** because it is the same invoice resent.
6. Open the run with bad totals (Desert Print House). It stopped at Validate with a clear reason. Click **Retry** to see it fail the same way, since the data is wrong.
7. **Run workflow** (top right): drag a .txt email onto the drop zone, or paste text, then run.
8. **Records** shows contacts, tasks, invoices and notifications created. **Daily report** has a copy button.

## 4. Turn on real Claude (optional)

1. Create a key at https://console.anthropic.com.
2. Copy the settings file and edit it:
   ```
   cp .env.example .env
   ```
   Uncomment `ANTHROPIC_API_KEY=sk-ant-...` and paste your key.
3. Restart the server (Ctrl+C, then the uvicorn command again).
4. The top bar should now say **Claude (model name)**.
5. Load demo data again on a fresh database (delete `handoff.db`), and compare the "What the AI found" panels with step 3. If a field looks wrong, note the run number.

Handoff checks every value Claude returns against the original text. If Claude invents something, the run falls back to the rules engine and low confidence is shown.

## 5. Run with Docker (optional, untested by me)

```
docker compose up --build
```
Open http://localhost:8000. If it fails, copy the error output and ask for a fix.

## 6. Run the tests

```
pip install -r requirements-dev.txt
pytest -q
```
Expected: 39 passed.

## 7. Edit the UI (optional)

```
cd frontend
npm install
npm run dev        # live preview at http://localhost:5173 (needs the Python server running)
npm run build      # writes the finished app into ../app/static
npm test
```

## 8. Put it on GitHub

```
git init
git add .
git commit -m "Handoff AI"
```
Create an empty repo on github.com, then run the `git remote add origin ...` and `git push -u origin main` lines GitHub shows you. Never commit your `.env` file (it is already in `.gitignore`).

## Troubleshooting

- **Port already in use**: use `--port 8001` and open that port.
- **`pip` not found**: use `python3 -m pip install -r requirements.txt`.
- **Blank page**: make sure you ran uvicorn from inside the `handoff` folder.
- **"Unauthorized" popup**: you set an `API_KEY` in `.env`. Click **API key** in the sidebar and enter it.
- **Want a clean slate**: stop the server, delete `handoff.db`, start again.

## What to say in an interview

- It turns messy emails and invoices into CRM records and approvals.
- Risky items (big invoices, complaints) pause for a person; everything else runs on its own.
- Runs are resumable, steps retry with backoff, and a duplicate invoice cannot be saved twice.
- It works without any AI key, and Claude outputs are checked against the source text.

## Deploy on Render

1. Push the project to GitHub (section 8).
2. Sign up at https://render.com with your GitHub account.
3. Click **New**, then **Blueprint**, and choose your handoff repo. Render reads `render.yaml`.
4. When asked for `ANTHROPIC_API_KEY`, paste your key, or leave it blank to use the built-in rules engine.
5. Click **Apply**. The first build takes a few minutes.
6. Open the `https://handoff-xxxx.onrender.com` link Render gives you, then click **Load demo data**.
7. Put that link in your README and CV.

Notes: the free web service sleeps after inactivity, so the first visit can take about 30 seconds. Render's free Postgres database is time-limited, so check Render's current free-tier terms and re-create it if it expires.
