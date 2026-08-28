## ADDED Requirements

### Requirement: Password reset by emailed one-time token
The system SHALL let a user who knows only their email set a new password. `POST /api/auth/forgot` SHALL answer 200 `{ok: true}` whether or not the email is registered; when it is, the system SHALL store only a SHA-256 of a 32-byte random token with a one-hour expiry and email a link `PUBLIC_APP_URL/reset?token=<token>` from `ALERT_FROM` via Resend. `POST /api/auth/reset` SHALL accept `{token, password}`, reject unknown, expired or used tokens with 400 "Reset link is invalid or has expired", enforce the 6-character minimum, replace the password hash, mark the token used, invalidate the user's other tokens, and return a login token plus `{id, email}`. When email is not configured on the host, `/forgot` SHALL answer 503 "Password reset is not available on this host (email is not configured)". Expired tokens SHALL be removed by the tick's expiry sweep. Both endpoints SHALL share the auth rate limiter.

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

## MODIFIED Requirements

### Requirement: No abuse controls
The system SHALL rate-limit `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot` and `/api/auth/reset` per client IP (`VR_RATE_AUTH_PER_MIN`, default 120), `/api/hook/{secret}` per secret (`VR_RATE_HOOK_PER_MIN`, default 120) and `POST /api/checks` per user (`VR_RATE_CREATE_PER_MIN`, default 60), answering excess requests with HTTP 429 and a `Retry-After` header. On Workers the counters are in-memory per isolate — best effort, reset when the isolate recycles; the Cloudflare rate-limit binding is the upgrade path. Email verification and account lockout remain absent.

#### Scenario: Repeated failed logins
- **WHEN** a client exceeds the auth limit within a minute on one isolate
- **THEN** further attempts return HTTP 429 until the window passes

#### Scenario: Webhook flood
- **WHEN** one secret exceeds the hook limit within a minute on one isolate
- **THEN** excess requests return HTTP 429 and no runs are queued for them
