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
- Connectors: HTTP/JSON (bearer token, optional JSON path, optional `newest_key`), Airtable (base_id, table, PAT, optional view — flattened `{id, createdTime, ...fields}` per record)
- Check detail: inline rename, verdict badge, snooze menu (1h/24h) + Resume-alerts, run-now, timeline hero, webhook URL + copy + curl, connector-aware Destination card, editable expectations, Slack alerts, public status, run filters + fingerprint diff in the run panel, 10s live polling
- Webhook endpoint `POST /api/hook/{secret}` (async, returns 200 with run_id)
- Manual `POST /api/checks/{id}/run` (async)
- Fingerprint + verdict logic (record delta, required fields, disappeared fields, non-empty); growth modes `growth` / `steady` / `claimed`; the webhook body may carry `{"wrote": N}` and the verdict reconciles it against real growth (2026-08-27)
- Server-side fetch via httpx; secrets (bearer tokens, Airtable PATs, Slack webhooks) Fernet-encrypted, only last 4 shown
- Alert channels per Check (2026-08-27): Slack, Discord, email (Resend; gated on `RESEND_API_KEY`+`ALERT_FROM`, `GET /api/meta` reports availability); `POST/DELETE /api/checks/{id}/channels`; legacy Slack field read as channel `legacy-slack`; runs record `alerts_sent: [{kind, ok}]`
- Slack FAIL / recovery alerts with **state-based dedup** (`last_alerted_verdict` on check) and **30s retry-before-alert** on fresh FAIL — no alert if the retry PASSes; snoozed checks skip alerting entirely
- Public status page: `POST/DELETE /api/checks/{id}/public` + unauthenticated `GET /api/public/checks/{token}` — no config/secrets/fingerprint leaked; frontend route `/status/:token`
- Snooze: `POST/DELETE /api/checks/{id}/snooze` with hours cap of 168; UI dropdown in detail header
- Webhook wait (2026-08-27): `POST /api/hook/{secret}?wait=N` (≤60) runs inline under asyncio.shield and returns the verdict; timeout → `verdict: null, timed_out: true`, run still lands
- Plans + interest (2026-08-27): `GET /api/plans` (early access, three tiers, planned prices), `POST /api/interest` (authenticated willingness-to-pay signal → `interest` collection); frontend `/pricing`, `/data`, landing rewritten with the diff message as hero
- Egress lockdown (2026-08-27): destinations must resolve to public addresses (save time + fetch time; `VR_ALLOW_PRIVATE_EGRESS=1` to allow), HTTP/JSON reads streamed and capped at `VR_MAX_RESPONSE_BYTES`, in-memory rate limits on auth (per IP), webhook (per secret), Check creation (per user) → 429 + Retry-After
- Data minimisation (2026-08-27): runs store `newest_hash` + `sample_stored` instead of rows; opt-in `store_samples` per Check keeps rows + error bodies in `run_samples` with a 30-day TTL index; `GET /api/runs/{id}` attaches `sample`; `DELETE /api/auth/me` purges everything
- Heartbeat (2026-08-27): `heartbeat_hours` per Check; in-process ticker records a `trigger="heartbeat"` FAIL run once per missed window (anchored on the last real run), straight to alert routing; next real PASS recovers

## Roadmap and specs — OpenSpec (added 2026-08-26)
The source of truth for behaviour and planned work is `openspec/`:
- `openspec/specs/<capability>/spec.md` — current behaviour as built, defects included.
- `openspec/changes/<name>/` — one folder per planned change: `proposal.md` (why),
  `design.md` (how), `specs/` (requirement deltas), `tasks.md` (checkboxes).
Before implementing anything, read the matching change's `tasks.md` and work
through its checkboxes in order; the last group is always "verify on preview,
then publish". Run `openspec validate --all --strict` after editing specs.
Done: `fix-record-cap-paging`, `postgres-detail-card`, `claimed-count-reconciliation`
`deterministic-newest-record`, `readme-and-docs`, `heartbeat-checks`, `email-and-discord-alerts`, `data-minimisation`, `egress-lockdown`, `n8n-community-node` (webhook-wait + private node repo
`farjad-hasan/verifyruns-n8n`), `landing-page-sell`, `pricing-tiers` (cheap version: /pricing + interest capture;
billing deferred to `billing-paddle`) (all 2026-08-27; Farjad chose
to keep building before distribution, overriding the deferred triggers). Development is local since 2026-08-27 (Emergent credits
exhausted): Docker Mongo :27017, Postgres :5434, uvicorn :8000, craco :3100.

## Backlog / Next (superseded by openspec/changes/ — kept for history)
- P1: Postgres connector (typed config already supports it)
- P1: Email alerts (requires a platform-built-in email mechanism)
- P2: Discord webhook alerts (same shape as Slack)
- ~~P2: Airtable multi-page (offset) for tables > 100 records~~ — done 2026-08-27 (`fix-record-cap-paging`): Airtable pages via `offset`, Postgres uses `COUNT(*)`; fingerprints carry `sample_size`
