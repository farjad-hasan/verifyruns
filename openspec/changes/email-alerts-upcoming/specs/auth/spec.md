## MODIFIED Requirements

### Requirement: Password reset by emailed one-time token
The system SHALL let a user who knows only their email set a new password. `POST /api/auth/forgot` SHALL answer 200 `{ok: true}` whether or not the email is registered; when it is, the system SHALL store only a SHA-256 of a 32-byte random token with a one-hour expiry and email a link `PUBLIC_APP_URL/reset?token=<token>` from `ALERT_FROM` via Resend. `POST /api/auth/reset` SHALL accept `{token, password}`, reject unknown, expired or used tokens with 400 "Reset link is invalid or has expired", enforce the 6-character minimum, replace the password hash, mark the token used, invalidate the user's other reset tokens, increment the user's `token_version` so every previously issued JWT stops authenticating, and return a fresh login token plus `{id, email}`. When email is not configured on the host, `/forgot` SHALL answer 503 "Password reset is not available on this host (email is not configured)". Expired tokens SHALL be removed by the tick's expiry sweep. Both endpoints SHALL share the auth rate limiter. `GET /api/meta` SHALL expose `password_reset` (true iff `RESEND_API_KEY` and `ALERT_FROM` are set) for the forgot page, independently of `email_alerts`. Password-reset mail MAY use Resend while product email alert channels remain upcoming.

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
- **THEN** `/forgot` answers 503 with the sentence above, so the page can say so, and `/meta` reports `password_reset: false`

#### Scenario: Meta for forgot page
- **WHEN** Resend secrets are set
- **THEN** `/meta` reports `password_reset: true` and the forgot page uses that field (not `email_alerts`)

#### Scenario: Stolen session dies on reset
- **WHEN** a JWT issued before the reset is presented after the reset
- **THEN** the response is 401, while the token returned by the reset itself keeps working
