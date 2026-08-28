## MODIFIED Requirements

### Requirement: Create a Check
The system SHALL create a Check with a name (1–120 chars), a `connector_kind` (`http_json` | `airtable` | `postgres`), a per-connector `config`, `expectations`, an optional Slack webhook, a `retry_before_alert` flag (default true), and a 32-byte urlsafe `webhook_secret`. Connector secrets in `config` SHALL be stored encrypted with AES-256-GCM under `ENC_KEY` and never returned in full.

#### Scenario: Create HTTP/JSON Check with bearer token
- **WHEN** `POST /api/checks` carries `config.url` and `config.bearer_token`
- **THEN** the stored config holds `bearer_token_encrypted` and the response shows only `has_bearer_token: true` and `bearer_token_last4`

#### Scenario: Missing required config
- **WHEN** an `airtable` Check omits `base_id` or `table`, or a `postgres` Check omits `query` or `dsn`
- **THEN** the response is HTTP 400 naming the missing field
