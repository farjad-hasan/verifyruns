# VerifyRuns

**Your automation said Done. VerifyRuns checks if that's true.**

n8n, Make and Zapier workflows finish green while silently writing nothing — or the wrong thing — to the destination. Every monitoring tool watches the *run*. VerifyRuns re-reads the *destination* after each run, fingerprints it, diffs it against the last 30 good runs, and tells you in plain English when a "successful" workflow didn't actually land:

```
FAIL — airtable-orders-sync
Run reported success, but your workflow said it wrote 3 records; the destination gained 0,
and the field `price` disappeared — it was present in the last 30 good runs.
```

## How it works

1. **Create a Check** — point VerifyRuns at your destination (an HTTP/JSON endpoint, an Airtable table, or a read-only Postgres query) and set expectations: growth per run, required fields, fields that must be non-empty.
2. **Paste the webhook** — add one HTTP Request node at the end of your workflow that POSTs to the Check's secret URL. Optionally tell VerifyRuns what the workflow believes it wrote:
   ```bash
   curl -X POST "https://<your-host>/api/hook/<secret>" \
        -H "content-type: application/json" -d '{"wrote": 3}'
   ```
3. **Get verdicts** — every run is PASS or FAIL with a diff message. Slack, Discord and email channels get a message on the first FAIL and again on recovery; not on every red run.

Per-platform setup: [n8n](docs/n8n.md) · [Make](docs/make.md) · [Zapier](docs/zapier.md).

## Connectors

| Connector | Config | Count | Newest record |
|---|---|---|---|
| HTTP / JSON | GET URL, optional bearer token, optional JSON path to the array, optional `newest_key` | length of the array | max of `newest_key`, else the last element |
| Airtable | base id, table, optional view, personal access token | true count via `offset` paging (ceiling 10,000) | newest `createdTime` |
| Postgres | connection string, a single read-only `SELECT`/`WITH` | `COUNT(*)` of the query | the query's own `ORDER BY … DESC`; without one, newest-record rules are skipped and the run says so |

Secrets are Fernet-encrypted at rest and only ever shown masked to their last four characters. All destination reads happen server-side.

## Verdict rules

- **Growth** — the destination must gain at least `min_new_records` (default 1; `0` makes growth optional), or at least what the workflow claimed with `{"wrote": N}`.
- **Steady** — the count must not change (lookup tables, config rows).
- **Claimed** — every webhook run must send `{"wrote": N}`; the destination must gain N.
- **Required fields** must be present; a field present in every one of the last 30 good runs that disappears is a FAIL.
- **Non-empty fields** — FAIL only when the newest record is empty *and* so is the majority of the five newest, so one odd row cannot flip a verdict.
- **Heartbeat** — "expect a run every N hours": if no run arrives in the window, VerifyRuns records a FAIL ("No run in 26 h — expected one every 24 h.") and alerts; the next real run recovers it. This catches the workflow that never fired, not just the one that fired and wrote nothing.

The engine is deterministic code — no model, no score you cannot inspect. Every rule is a pure function with tests in `backend/tests/`.

## Run it yourself

Backend: FastAPI + Motor (MongoDB). Frontend: React 19 + Tailwind + shadcn/ui.

```bash
# MongoDB
docker run -d --name verifyruns-mongo -p 27017:27017 mongo:7

# Backend
cd backend
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
cat > .env <<EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=verifyruns
JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')
FERNET_KEY=$(.venv/bin/python -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')
PUBLIC_APP_URL=http://localhost:3100
CORS_ORIGINS=http://localhost:3100
EOF
.venv/bin/uvicorn server:app --port 8000

# Frontend
cd ../frontend
echo 'REACT_APP_BACKEND_URL=http://localhost:8000' > .env
npm install --legacy-peer-deps
PORT=3100 npm start          # or: npm run build
```

Optional environment: `RESEND_API_KEY` + `ALERT_FROM` (enables email alerts), `VR_RETRY_DELAY_SECONDS` (30), `VR_HEARTBEAT_TICK_SECONDS` (60), `VR_AIRTABLE_MAX_RECORDS` (10000), `VR_PG_COUNT_TIMEOUT_MS` (15000) — full list in [docs/self-hosting.md](docs/self-hosting.md).

Tests run against a live backend plus pure-function suites:

```bash
cd backend
REACT_APP_BACKEND_URL=http://localhost:8000 .venv/bin/pytest tests -q
# add VR_TEST_PG_DSN=postgresql://... to run the Postgres end-to-end tests
```

Before you point it at real data, read [docs/what-we-store.md](docs/what-we-store.md).

## Roadmap

Planned work is tracked with [OpenSpec](https://github.com/Fission-AI/OpenSpec) in [`openspec/`](openspec/): `specs/` describes the behaviour as built, `changes/` holds one folder per proposal with its design, requirement deltas and task list. `openspec list` shows what is in flight.

## Status

Built for the Emergent Builder Fest (August 2026); developed locally since 2026-08-27. Alpha — the API and data model may change.
