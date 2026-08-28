# auth

## Purpose
Email + password accounts that own Checks. JWT bearer tokens, bcrypt hashes. As built in `backend/server.py` (auth section).

## Requirements

### Requirement: Register with email and password
The system SHALL create a user from a unique, lower-cased email and a password of at least 6 characters, and return a 7-day HS256 JWT plus `{id, email}`.

#### Scenario: New email registers
- **WHEN** `POST /api/auth/register` receives an unused email and a 6+ character password
- **THEN** a user is stored with a bcrypt hash and the response carries a token and the normalised email

#### Scenario: Duplicate email is rejected
- **WHEN** the email (case-insensitive) already exists
- **THEN** the response is HTTP 400 "Email already registered"

### Requirement: Login returns a token
The system SHALL verify the password against the stored bcrypt hash and return a fresh token; it SHALL NOT reveal whether the email or the password was wrong.

#### Scenario: Wrong credentials
- **WHEN** the email is unknown or the password does not match
- **THEN** the response is HTTP 401 "Invalid email or password"

### Requirement: Bearer token gates every private route
The system SHALL resolve the current user from the `Authorization: Bearer` header on every `/api` route except register, login, the webhook, and public status; expired or invalid tokens return 401.

#### Scenario: Token expired
- **WHEN** a request carries a token past its 7-day `exp`
- **THEN** the response is HTTP 401 "Token expired"

### Requirement: No abuse controls
The system SHALL rate-limit `/api/auth/register` and `/api/auth/login` per client IP (`VR_RATE_AUTH_PER_MIN`, default 120), `/api/hook/{secret}` per secret (`VR_RATE_HOOK_PER_MIN`, default 120) and `POST /api/checks` per user (`VR_RATE_CREATE_PER_MIN`, default 60), answering excess requests with HTTP 429 and a `Retry-After` header. On Workers the counters are in-memory per isolate — best effort, reset when the isolate recycles; the Cloudflare rate-limit binding is the upgrade path. Email verification and password reset remain absent.

#### Scenario: Repeated failed logins
- **WHEN** a client exceeds the auth limit within a minute on one isolate
- **THEN** further attempts return HTTP 429 until the window passes

#### Scenario: Webhook flood
- **WHEN** one secret exceeds the hook limit within a minute on one isolate
- **THEN** excess requests return HTTP 429 and no runs are queued for them
