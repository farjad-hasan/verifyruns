## Why

A stranger who forgets their password loses the account and every Check in it; the only recourse today is a new account. Listed as a known gap since the first security page. The 2026-08-29 review ranks it the first blocker for external users. Email delivery now exists (Resend), so the mechanism is available; it becomes dependable for other users once a sending domain is verified, and the code must not wait for that.

## What Changes

- `POST /api/auth/forgot` `{email}`: always answers 200 `{ok: true}` (no account enumeration). When the account exists and email is configured, it stores a SHA-256 of a fresh 32-byte token with a 1-hour expiry and emails `PUBLIC_APP_URL/reset?token=…` via Resend. When email is not configured on the host it answers 503 with a plain sentence, because a silent 200 would strand the user.
- `POST /api/auth/reset` `{token, password}`: validates the token (unexpired, unused, hash matches), sets the new PBKDF2 hash, marks the token used, deletes the user's other tokens, and returns a fresh login token + user like `/login`.
- Both endpoints share the auth rate limiter.
- New table `password_resets`; the tick's expiry sweep also deletes expired tokens.
- Frontend: "Forgot password?" on the login page → `/forgot` (email form) → `/reset?token=…` (new password form, logs the user in on success). `/forgot` reads `/api/meta` and explains when reset is unavailable on the host.
- Docs: `security.md` and `/security` drop "password reset" from known gaps and describe the token model.

## Capabilities

### Modified Capabilities
- `auth`: password reset by emailed one-time token.

## Impact

`worker/migrations/0002_password_resets.sql`, `worker/src/routes.ts`, `worker/src/index.ts`, `worker/src/tick.ts`, `worker/src/alerts.ts` (reuse the Resend seam), frontend `AuthPage`, two new pages, `App.js`, `docs/security.md`, `SecurityPage.jsx`, `README.md`.
