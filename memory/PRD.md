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

## Implemented (2026-02)
- Landing page: hero, problem, how-it-works, CTA, footer
- Email + password auth (register, login, /me, logout on client)
- Dashboard: checks list with 30-run timeline strips, empty state, 10s live polling
- New Check form: name, HTTP/JSON connector, expectations, Slack alert webhook
- Check detail: verdict badge, run-now button, timeline hero, webhook URL + copy + curl example, config, expectations, Slack alerts card (add/replace/remove), run history list, run panel (verdict, diff, fingerprint), 10s live polling
- Webhook endpoint `POST /api/hook/{secret}` (async, returns 200 with run_id)
- Manual `POST /api/checks/{id}/run` (async)
- Fingerprint + verdict logic (record delta, required fields, disappeared fields, non-empty)
- Server-side fetch via httpx, bearer tokens Fernet-encrypted, only last 4 shown
- Slack FAIL alerts + recovery alerts (on FAIL→PASS transition), non-blocking, Fernet-encrypted webhook URL, includes check name/diff/timestamp/link

## Backlog / Next
- P1: Additional connectors (Airtable, Postgres) — connector_kind is already stored typed
- P1: Email alerts (requires a platform-built-in email mechanism; currently Slack-only)
- P2: Per-check settings edit UI for expectations (backend PATCH exists)
- P2: Public run status page / shareable link
- P2: Timezone selection in UI
