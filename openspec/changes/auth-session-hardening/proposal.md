## Why

The only credential-stuffing control is defeated by one header: `clientIp` prefers attacker-controlled `X-Forwarded-For` over Cloudflare's `CF-Connecting-IP`, so the auth rate limiter keys on whatever the caller sends — unlimited login/register/forgot/reset attempts, and unbounded growth of the limiter map. Separately, a password reset does not end existing sessions: a stolen 7-day JWT survives the victim's reset, the classic account-recovery gap. Two smaller oracles round it out: an unknown email returns from login in ~1 ms while a known one pays full PBKDF2 (timing enumeration), and PBKDF2 at 100k iterations is well below current OWASP guidance (600k).

Production-readiness review 2026-08-31: CRITICAL #2, HIGH #3, MEDIUM #10, #21.

## What Changes

- Client IP is `CF-Connecting-IP` only; `X-Forwarded-For` is never consulted. (Self-hosted behind Cloudflare gets the same header; a non-Cloudflare deployment falls back to the socket address, never a client header.)
- `users` gains `token_version`; JWTs carry it; `currentUser` — which already re-reads the user row per request — rejects mismatches. Password reset increments it, logging out every existing session. Password change via reset returns a fresh token so the resetting user stays in.
- Login hashes against a fixed dummy record when the email is unknown, so timing does not reveal registration.
- `VR_PBKDF2_ITERATIONS` raised to 600,000; stored hashes record their iteration count and are transparently re-hashed on the next successful login.

## Capabilities

### Modified Capabilities
- `auth`: rate-limit keying, session invalidation on reset, constant-work login, hash strength with transparent upgrade.

## Impact

`worker/src/http.ts` (clientIp), `worker/src/crypto.ts` (JWT claim, hash format), `worker/src/routes.ts` (login, currentUser), `worker/src/reset.ts`, `worker/migrations/0004_token_version.sql`, `wrangler.toml` vars, `worker/test/auth*.test.ts`, `docs/security.md`.
