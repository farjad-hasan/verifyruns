# Security

## Reporting

Email **farjad.developer@gmail.com** with "VerifyRuns security" in the subject. Please do not open a public issue for anything exploitable. You will get a reply within a few days; fixes are tracked as OpenSpec changes in this repository once they are safe to discuss.

## Current posture (2026-08-27)

- Passwords: bcrypt. Sessions: HS256 JWT, 7-day expiry, no refresh.
- Secrets at rest: Fernet with a single server key; never returned to clients in full.
- Webhook secrets: 32 random bytes, urlsafe; public status tokens: 24.
- Postgres connector: single `SELECT`/`WITH` statement, keyword filter, and `default_transaction_read_only = on` on the session.
- All destination reads are server-side.

## Known gaps, tracked

- No rate limiting on sign-up, login or webhooks; no email verification or password reset — `openspec/changes/egress-lockdown`.
- The server will fetch private/link-local addresses a user configures (SSRF on shared hosts) — `egress-lockdown`.
- Raw destination samples are stored per run — `openspec/changes/data-minimisation`.
- Background tasks run in the API process — see `docs/self-hosting.md`.

Run VerifyRuns on a host where those gaps are acceptable, or self-host behind your own network controls, until they close.
