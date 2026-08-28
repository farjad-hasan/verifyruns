# Self-hosting VerifyRuns

VerifyRuns is one Cloudflare Worker (`worker/`, TypeScript) with a D1 database and a cron trigger, plus a static React build. Self-hosting means running the same thing in your own Cloudflare account — the free plan is enough; see [deploy.md](deploy.md) for the step-by-step.

## Secrets (`wrangler secret put`)

| Secret | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | yes | signs login tokens (7-day expiry); rotate to log everyone out |
| `ENC_KEY` | yes | 32 random bytes, base64 — AES-256-GCM key for connector secrets and alert targets at rest. **Losing it makes every stored secret unreadable** |
| `VR_TICK_SECRET` | yes | enables `POST /api/internal/tick` (header `X-Tick-Secret`) for manual ticks |
| `RESEND_API_KEY` | no | enables email alert channels via [Resend](https://resend.com); without it, adding an email channel is refused with a clear message |
| `ALERT_FROM` | no | sender for email alerts, e.g. `VerifyRuns <alerts@yourdomain>` — a domain verified in Resend |

## Variables (`worker/wrangler.toml [vars]`)

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_APP_URL` | the Pages URL | "Open in VerifyRuns" links in alerts |
| `CORS_ORIGINS` | the Pages URL | comma-separated origins allowed to call the API |
| `VR_EARLY_ACCESS` | `1` | early-access mode: no billing, plan limits off |
| `VR_ALLOW_PRIVATE_EGRESS` | `0` | `1` lets Checks point at private/loopback/link-local addresses. Only on an instance where every user is trusted |
| `VR_MAX_RESPONSE_BYTES` | 5 MB | HTTP/JSON responses are streamed and abandoned past this size |
| `VR_AIRTABLE_MAX_PAGES` | `40` | Airtable count stops here (100 records per page) and the run says "count capped" — the free plan allows 50 subrequests per request |
| `VR_RATE_AUTH_PER_MIN` / `VR_RATE_HOOK_PER_MIN` / `VR_RATE_CREATE_PER_MIN` | 120 / 120 / 60 | per-minute limits for sign-up+login per IP, webhook per secret, Check creation per user; best effort per isolate |
| `VR_RETRY_DELAY_SECONDS` | `30` | how long after a fresh FAIL the retry becomes due; it runs on the next tick |
| `VR_LAZY_TICK_SECONDS` | `60` | any request this long after the last tick runs one in the background (`0` disables); the cron trigger ticks every minute regardless |
| `VR_PBKDF2_ITERATIONS` | `100000` | password hashing cost |
| `VR_PG_CONNECT_TIMEOUT_MS` | `15000` | Postgres connection budget, one attempt, no reconnects. TLS is used unless the DSN says `sslmode=disable`; see the certificate note in `deploy.md` |
| `VR_PG_COUNT_TIMEOUT_MS` / `VR_PG_SAMPLE_TIMEOUT_MS` | `15000` | Postgres `COUNT(*)` timeout (falls back to the sample length, `count_estimated: true`) and sample query timeout |
| `VR_SAMPLE_TTL_DAYS` | `30` | how long opt-in raw samples live before the tick deletes them |

## Network

Destinations must be public addresses unless `VR_ALLOW_PRIVATE_EGRESS=1`; redirects are not followed; Workers verify TLS against public CAs only (Postgres providers with private CAs need `sslmode=disable` or a publicly trusted certificate — see `deploy.md`).

## Backups

`wrangler d1 export verifyruns --remote --output backup.sql` dumps the database; `ENC_KEY` must be backed up alongside it or the connector secrets inside are unreadable.
