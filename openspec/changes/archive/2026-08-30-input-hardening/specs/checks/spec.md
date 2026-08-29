## MODIFIED Requirements

### Requirement: List, read, update, delete own Checks only
The system SHALL scope every Check route to `user_id`; a Check owned by another user returns 404. The list route SHALL include the last 30 runs (oldest → newest) and `last_verdict` and SHALL omit `webhook_secret`; the detail route includes it. On update, an unknown `connector_kind` SHALL be refused with 400, and a `connector_kind` different from the stored one SHALL be refused with 400 unless the same request carries a `config` for the new kind.

#### Scenario: Cross-user access
- **WHEN** user B requests user A's Check by id
- **THEN** the response is HTTP 404 "Check not found"

#### Scenario: Update keeps stored secrets when omitted
- **WHEN** `PATCH /api/checks/{id}` sends `config` without the secret field
- **THEN** the previously encrypted secret is preserved

#### Scenario: Kind change without config
- **WHEN** `PATCH /api/checks/{id}` sends `connector_kind: "airtable"` and no `config` on an `http_json` Check
- **THEN** the response is HTTP 400 "config is required when changing connector_kind" and the Check is unchanged

### Requirement: Alert channels are managed per Check
A Check SHALL hold a list of alert channels, each `{id, kind: slack | discord | email, target}` with the target Fernet-encrypted at rest. `POST /api/checks/{id}/channels {kind, target}` SHALL add one and return `{id, kind, last4}`; `DELETE /api/checks/{id}/channels/{channel_id}` SHALL remove it. The sanitised Check SHALL list channels as `{id, kind, last4}` only. A legacy single Slack URL SHALL appear as channel id `legacy-slack`. Every target SHALL be validated at save time wherever it is accepted: slack and discord targets MUST be `http`/`https` URLs whose host passes the egress policy applied to destinations; email targets MUST be email addresses. Violations are HTTP 422 with `loc` naming the field.

#### Scenario: Add a Discord channel
- **WHEN** the owner POSTs `{kind: "discord", target: "https://discord.com/api/webhooks/…/abcd"}`
- **THEN** the response is `{id, kind: "discord", last4: "••••••••abcd"}` and the Check lists it

#### Scenario: Email without a configured sender
- **WHEN** `RESEND_API_KEY` or `ALERT_FROM` is unset and the owner POSTs `{kind: "email", target: "ops@example.com"}`
- **THEN** the response is HTTP 400 "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)."

#### Scenario: Remove a channel
- **WHEN** the owner DELETEs a channel id
- **THEN** it no longer appears on the Check and receives no further alerts

#### Scenario: Webhook target on a private address
- **WHEN** the owner adds `{kind: "slack", target: "http://169.254.169.254/hook"}` or sets it as the legacy Slack field
- **THEN** the response is HTTP 422 and nothing is stored
