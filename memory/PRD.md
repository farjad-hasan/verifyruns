# RunProof - PRD

## Original problem statement
Build RunProof — a web app that verifies whether "successful" no-code automation
runs (n8n, Make, Zapier) actually landed data in their destination. After each
run, RunProof re-reads the destination itself and posts a PASS or FAIL verdict
with a human-readable diff.

Tagline: "Your automation said Done. RunProof checks if that's true."

## User personas
- **No-code operator**: builds n8n/Make/Zapier workflows; needs assurance the
  destination actually received the data.
- **Ops/eng manager**: wants a dashboard-level view of workflow reliability.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). Single `server.py`. All routes under `/api`.
- **Auth**: JWT (HS256) via Bearer tokens; bcrypt password hashing.
- **Encryption at rest**: Fernet (`FERNET_KEY` in `.env`) for connector bearer tokens.
- **Async check execution**: FastAPI `BackgroundTasks`.
- **Frontend**: React 19 + react-router 7 + Tailwind + shadcn/ui + sonner toasts.
- **Design**: Dark UI (#0A0A0A base), Outfit / Manrope / JetBrains Mono, emerald/red status.

## Data model
- `users` { id, email (unique), password_hash, created_at }
- `checks` { id, user_id, name, connector_kind, config { url, bearer_token_encrypted?, json_path? }, expectations { min_new_records, required_fields, non_empty_fields }, webhook_secret (unique), created_at }
- `check_runs` { id, check_id, timestamp, trigger, verdict, diff_message, fingerprint { record_count, fields, newest_record, null_pct }, error_details }

## Implemented (2026-08)
- Landing page: hero, problem, how-it-works, CTA, footer
- Email + password auth (register, login, /me, logout on client)
- Dashboard: checks list with 30-run timeline strips, empty state, 10s live polling, health summary strip, "Snoozed" tag on rows
- New Check form: name, connector chooser (HTTP / JSON | Airtable), per-connector fields, expectations, Slack alert webhook
- Connectors: HTTP/JSON (bearer token, optional JSON path), Airtable (base_id, table, PAT, optional view — flattened `{id, createdTime, ...fields}` per record)
- Check detail: inline rename, verdict badge, snooze menu (1h/24h) + Resume-alerts, run-now, timeline hero, webhook URL + copy + curl, connector-aware Destination card, editable expectations, Slack alerts, public status, run filters + fingerprint diff in the run panel, 10s live polling
- Webhook endpoint `POST /api/hook/{secret}` (async, returns 200 with run_id)
- Manual `POST /api/checks/{id}/run` (async)
- Fingerprint + verdict logic (record delta, required fields, disappeared fields, non-empty); growth modes `growth` / `steady` / `claimed`; the webhook body may carry `{"wrote": N}` and the verdict reconciles it against real growth (2026-08-27)
- Server-side fetch via httpx; secrets (bearer tokens, Airtable PATs, Slack webhooks) Fernet-encrypted, only last 4 shown
- Slack FAIL / recovery alerts with **state-based dedup** (`last_alerted_verdict` on check) and **30s retry-before-alert** on fresh FAIL — no alert if the retry PASSes; snoozed checks skip alerting entirely
- Public status page: `POST/DELETE /api/checks/{id}/public` + unauthenticated `GET /api/public/checks/{token}` — no config/secrets/fingerprint leaked; frontend route `/status/:token`
- Snooze: `POST/DELETE /api/checks/{id}/snooze` with hours cap of 168; UI dropdown in detail header

## Roadmap and specs — OpenSpec (added 2026-08-26)
The source of truth for behaviour and planned work is `openspec/`:
- `openspec/specs/<capability>/spec.md` — current behaviour as built, defects included.
- `openspec/changes/<name>/` — one folder per planned change: `proposal.md` (why),
  `design.md` (how), `specs/` (requirement deltas), `tasks.md` (checkboxes).
Before implementing anything, read the matching change's `tasks.md` and work
through its checkboxes in order; the last group is always "verify on preview,
then publish". Run `openspec validate --all --strict` after editing specs.
Done: `fix-record-cap-paging`, `postgres-detail-card`, `claimed-count-reconciliation`
(all 2026-08-27). Apply-ready: `deterministic-newest-record`. Development is local since 2026-08-27 (Emergent credits
exhausted): Docker Mongo :27017, Postgres :5434, uvicorn :8000, craco :3100.

## Backlog / Next (superseded by openspec/changes/ — kept for history)
- P1: Postgres connector (typed config already supports it)
- P1: Email alerts (requires a platform-built-in email mechanism)
- P2: Discord webhook alerts (same shape as Slack)
- ~~P2: Airtable multi-page (offset) for tables > 100 records~~ — done 2026-08-27 (`fix-record-cap-paging`): Airtable pages via `offset`, Postgres uses `COUNT(*)`; fingerprints carry `sample_size`
