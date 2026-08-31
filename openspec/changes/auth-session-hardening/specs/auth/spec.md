## MODIFIED Requirements

### Requirement: No abuse controls
The system SHALL rate-limit `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot` and `/api/auth/reset` per client IP (`VR_RATE_AUTH_PER_MIN`, default 120), `/api/hook/{secret}` per secret (`VR_RATE_HOOK_PER_MIN`, default 120) and `POST /api/checks` per user (`VR_RATE_CREATE_PER_MIN`, default 60), answering excess requests with HTTP 429 and a `Retry-After` header. The client IP SHALL be read from `CF-Connecting-IP` only; `X-Forwarded-For` and other client-suppliable headers SHALL never be consulted, and when no trusted header exists requests SHALL share a single fallback bucket. On Workers the counters are in-memory per isolate — best effort, reset when the isolate recycles; the Cloudflare rate-limit binding is the upgrade path. Email verification and account lockout remain absent.

#### Scenario: Repeated failed logins
- **WHEN** a client exceeds the auth limit within a minute on one isolate
- **THEN** further attempts return HTTP 429 until the window passes

#### Scenario: Webhook flood
- **WHEN** one secret exceeds the hook limit within a minute on one isolate
- **THEN** excess requests return HTTP 429 and no runs are queued for them

#### Scenario: Spoofed forwarding header
- **WHEN** a client sends a different random `X-Forwarded-For` on each login attempt
- **THEN** the attempts are counted against the same `CF-Connecting-IP` bucket and hit the limit

### Requirement: Login returns a token
The system SHALL verify the password against the stored password hash and return a fresh token; it SHALL NOT reveal whether the email or the password was wrong, in the response body or in timing — an unknown email SHALL cost the same password-hash verification as a known one.

#### Scenario: Wrong credentials
- **WHEN** the email is unknown or the password does not match
- **THEN** the response is HTTP 401 "Invalid email or password"

#### Scenario: Timing on unknown email
- **WHEN** login is attempted with an unregistered email
- **THEN** the request performs a dummy hash verification of equal cost before answering 401

### Requirement: Password reset by emailed one-time token
The system SHALL let a user who knows only their email set a new password. `POST /api/auth/forgot` SHALL answer 200 `{ok: true}` whether or not the email is registered; when it is, the system SHALL store only a SHA-256 of a 32-byte random token with a one-hour expiry and email a link `PUBLIC_APP_URL/reset?token=<token>` from `ALERT_FROM` via Resend. `POST /api/auth/reset` SHALL accept `{token, password}`, reject unknown, expired or used tokens with 400 "Reset link is invalid or has expired", enforce the 6-character minimum, replace the password hash, mark the token used, invalidate the user's other reset tokens, increment the user's `token_version` so every previously issued JWT stops authenticating, and return a fresh login token plus `{id, email}`. When email is not configured on the host, `/forgot` SHALL answer 503 "Password reset is not available on this host (email is not configured)". Expired tokens SHALL be removed by the tick's expiry sweep. Both endpoints SHALL share the auth rate limiter.

#### Scenario: Known email
- **WHEN** `POST /api/auth/forgot` receives a registered email on a host with email configured
- **THEN** one email is sent to that address containing a `/reset?token=` link, the response is 200 `{ok: true}`, and the stored row holds the token's hash, not the token

#### Scenario: Unknown email
- **WHEN** the email is not registered
- **THEN** the response is still 200 `{ok: true}` and no email is sent

#### Scenario: Reset with a valid token
- **WHEN** `POST /api/auth/reset` receives the emailed token and a new password within the hour
- **THEN** login with the new password succeeds, the old password fails, the same token is refused a second time, and the response carries a login token

#### Scenario: Expired token
- **WHEN** the token is older than one hour
- **THEN** the response is 400 "Reset link is invalid or has expired"

#### Scenario: Host without email
- **WHEN** `RESEND_API_KEY` or `ALERT_FROM` is unset
- **THEN** `/forgot` answers 503 with the sentence above, so the page can say so

#### Scenario: Stolen session dies on reset
- **WHEN** a JWT issued before the reset is presented after the reset
- **THEN** the response is 401, while the token returned by the reset itself keeps working

## ADDED Requirements

### Requirement: Password hashes carry their own strength
Stored password hashes SHALL record their PBKDF2 iteration count; verification SHALL use the stored count, and new hashes SHALL use `VR_PBKDF2_ITERATIONS` (default 600,000). A successful login against a hash weaker than the current setting SHALL transparently re-hash the password at the current strength.

#### Scenario: Old hash upgrades on login
- **WHEN** a user with a 100,000-iteration hash logs in successfully after the default rises
- **THEN** the stored hash is replaced with a 600,000-iteration one and the next login verifies against it
