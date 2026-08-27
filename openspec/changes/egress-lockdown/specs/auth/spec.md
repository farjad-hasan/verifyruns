## MODIFIED Requirements

### Requirement: No abuse controls
The system SHALL rate-limit `/api/auth/register` and `/api/auth/login` per client IP (`VR_RATE_AUTH_PER_MIN`, default 120), `/api/hook/{secret}` per secret (`VR_RATE_HOOK_PER_MIN`, default 120) and `POST /api/checks` per user (`VR_RATE_CREATE_PER_MIN`, default 60), answering excess requests with HTTP 429 and a `Retry-After` header. Email verification and password reset remain absent.

#### Scenario: Repeated failed logins
- **WHEN** a client exceeds the auth limit within a minute
- **THEN** further attempts return HTTP 429 until the window passes

#### Scenario: Webhook flood
- **WHEN** one secret exceeds the hook limit within a minute
- **THEN** excess requests return HTTP 429 and no runs are queued for them
