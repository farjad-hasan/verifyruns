## ADDED Requirements

### Requirement: Alert channels are managed per Check
A Check SHALL hold a list of alert channels, each `{id, kind: slack | discord | email, target}` with the target Fernet-encrypted at rest. `POST /api/checks/{id}/channels {kind, target}` SHALL add one and return `{id, kind, last4}`; `DELETE /api/checks/{id}/channels/{channel_id}` SHALL remove it. The sanitised Check SHALL list channels as `{id, kind, last4}` only. A legacy single Slack URL SHALL appear as channel id `legacy-slack`.

#### Scenario: Add a Discord channel
- **WHEN** the owner POSTs `{kind: "discord", target: "https://discord.com/api/webhooks/…/abcd"}`
- **THEN** the response is `{id, kind: "discord", last4: "••••••••abcd"}` and the Check lists it

#### Scenario: Email without a configured sender
- **WHEN** `RESEND_API_KEY` or `ALERT_FROM` is unset and the owner POSTs `{kind: "email", target: "ops@example.com"}`
- **THEN** the response is HTTP 400 "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)."

#### Scenario: Remove a channel
- **WHEN** the owner DELETEs a channel id
- **THEN** it no longer appears on the Check and receives no further alerts

### Requirement: Runs record delivery attempts
After alert routing, a run SHALL carry `alerts_sent: [{kind, ok}]` — one entry per channel attempted — so the owner can see that an alert went out.

#### Scenario: Two channels, one down
- **WHEN** a fresh FAIL is delivered to Slack (2xx) and Discord (5xx)
- **THEN** the run shows `alerts_sent: [{kind: "slack", ok: true}, {kind: "discord", ok: false}]`
