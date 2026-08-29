# Security

## Reporting

Email **farjad.developer@gmail.com** with "VerifyRuns security" in the subject. Please do not open a public issue for anything exploitable. You will get a reply within a few days; fixes are tracked as OpenSpec changes in this repository once they are safe to discuss.

## Current posture (2026-08-28, Cloudflare Workers build)

- Passwords: PBKDF2-SHA256 via WebCrypto, 100,000 iterations, per-user 16-byte salt. Sessions: HS256 JWT, 7-day expiry, no refresh.
- Password reset: `POST /api/auth/forgot` always answers 200 (no account enumeration) and, for a real account, emails a one-time link via Resend. Only the SHA-256 of the 32-byte token is stored; it expires after one hour, a newer request cancels older links, and a used token is refused. The reset endpoint shares the auth rate limiter. On a host without `RESEND_API_KEY`/`ALERT_FROM` the endpoint answers 503 and the page says so.
- Secrets at rest (bearer tokens, Airtable PATs, Postgres connection strings, alert-channel targets): AES-256-GCM under a single `ENC_KEY` held as a Worker secret; never returned to clients beyond the last four characters.
- Webhook secrets: 32 random bytes, URL-safe; public status tokens: 24.
- Egress (`egress-lockdown`, shipped): destinations whose host is a literal loopback, private, link-local, unspecified or cloud-metadata address (or `localhost`) are refused at save time and again before every fetch unless the self-host switch `VR_ALLOW_PRIVATE_EGRESS=1` is set; redirects are not followed; responses are capped at 5 MB and requests at 20 s. DNS names are not resolved on Workers — for named hosts the guarantee is the platform's own network, which cannot reach private ranges.
- Rate limits: `/api/auth/*` per IP, `/api/hook/*` per secret (120/min each), Check creation per user (60/min). Best effort — counters live per isolate, not globally.
- Postgres connector: single `SELECT`/`WITH` statement (no semicolons), wrapped as a subquery, with `default_transaction_read_only = on` on the session. Use a read-only role anyway. TLS is on unless the connection string says `sslmode=disable`, and the connector never downgrades on its own; on the hosted build the platform verifies server certificates against public CAs only (private-CA providers such as Supabase fail fast with an explanation rather than connect unverified; publicly-signed ones such as Neon connect over TLS normally).
- Data minimisation (`data-minimisation`, shipped): runs keep a fingerprint and a SHA-256 of the newest record, not rows; raw samples are opt-in per Check and expire after ~30 days. Details in [what-we-store.md](what-we-store.md).
- All destination reads are server-side; the browser never touches a destination.
- Headers (2026-08-30): every API response carries HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The site (`frontend/public/_headers`) serves a Content-Security-Policy that runs scripts from its own origin only, connects only to itself and the API, and refuses framing — the backstop for the session token living in local storage.
- Alert targets are validated like destinations (2026-08-30): Slack/Discord webhooks must be public `http(s)` URLs under the same egress policy; email targets must be addresses.
- Monitoring: `GET /api/health` answers 503 when the cron has not ticked within 10 minutes; a scheduled GitHub Actions job probes it every 30 minutes and emails the owner on a red run. CI runs the worker suite and a frontend build on every push.

## Known gaps, tracked

- No email verification or account lockout.
- Rate limits are per isolate; a determined caller can exceed them across isolates.
- The session token lives in local storage (readable by any script that runs on the page); the CSP is the mitigation, an httpOnly cookie the upgrade.

Self-hosters: `VR_ALLOW_PRIVATE_EGRESS=1` disables the address checks — only set it on a host where every user is trusted.
