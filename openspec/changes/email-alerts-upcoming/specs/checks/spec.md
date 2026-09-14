## MODIFIED Requirements

### Requirement: Alert channels are managed per Check
A Check SHALL hold a list of alert channels, each `{id, kind: slack | discord | email, target}` with the target Fernet-encrypted at rest. `POST /api/checks/{id}/channels {kind, target}` SHALL add one and return `{id, kind, last4}`; `DELETE /api/checks/{id}/channels/{channel_id}` SHALL remove it. The sanitised Check SHALL list channels as `{id, kind, last4}` only. A legacy single Slack URL SHALL appear as channel id `legacy-slack`. Every target SHALL be validated at save time wherever it is accepted: slack and discord targets MUST be `http`/`https` URLs whose host passes the egress policy applied to destinations; email targets MUST be email addresses. Violations are HTTP 422 with `loc` naming the field. Email alert channels are product-upcoming: unless `VR_EMAIL_ALERTS` is truthy, creating an email channel (on create-check or add-channel) SHALL return HTTP 400 "Email alerts are upcoming. Use Slack or Discord for now." even when Resend secrets are set. When `VR_EMAIL_ALERTS` is truthy and `RESEND_API_KEY` or `ALERT_FROM` is unset, creation SHALL return HTTP 400 "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)." `GET /api/meta` SHALL return `{ password_reset: boolean, email_alerts: boolean }` where `password_reset` is true iff both Resend secrets are set, and `email_alerts` is true iff `VR_EMAIL_ALERTS` is truthy.

#### Scenario: Add a Discord channel
- **WHEN** the owner POSTs `{kind: "discord", target: "https://discord.com/api/webhooks/…/abcd"}`
- **THEN** the response is `{id, kind: "discord", last4: "••••••••abcd"}` and the Check lists it

#### Scenario: Email alerts upcoming by default
- **WHEN** `VR_EMAIL_ALERTS` is unset and the owner POSTs `{kind: "email", target: "ops@example.com"}` even with Resend secrets set
- **THEN** the response is HTTP 400 "Email alerts are upcoming. Use Slack or Discord for now."

#### Scenario: Email without a configured sender
- **WHEN** `VR_EMAIL_ALERTS` is truthy and `RESEND_API_KEY` or `ALERT_FROM` is unset and the owner POSTs `{kind: "email", target: "ops@example.com"}`
- **THEN** the response is HTTP 400 "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)."

#### Scenario: Meta splits password reset from alert email
- **WHEN** a client GETs `/api/meta` with Resend secrets set and `VR_EMAIL_ALERTS` unset
- **THEN** the body is `{ password_reset: true, email_alerts: false }`

#### Scenario: Remove a channel
- **WHEN** the owner DELETEs a channel id
- **THEN** it no longer appears on the Check and receives no further alerts

#### Scenario: Webhook target on a private address
- **WHEN** the owner adds `{kind: "slack", target: "http://169.254.169.254/hook"}` or sets it as the legacy Slack field
- **THEN** the response is HTTP 422 and nothing is stored
