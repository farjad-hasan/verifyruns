# checks

## Purpose
A Check is one destination plus expectations, owned by a user, with a secret webhook URL and a history of runs. As built in `backend/server.py` (Check CRUD, runs, webhook).

## Requirements

### Requirement: Create a Check
The system SHALL create a Check with a name (1–120 chars), a `connector_kind` (`http_json` | `airtable` | `postgres`), a per-connector `config`, `expectations`, an optional Slack webhook, a `retry_before_alert` flag (default true), and a 32-byte urlsafe `webhook_secret`. Connector secrets in `config` SHALL be stored Fernet-encrypted and never returned in full.

#### Scenario: Create HTTP/JSON Check with bearer token
- **WHEN** `POST /api/checks` carries `config.url` and `config.bearer_token`
- **THEN** the stored config holds `bearer_token_encrypted` and the response shows only `has_bearer_token: true` and `bearer_token_last4`

#### Scenario: Missing required config
- **WHEN** an `airtable` Check omits `base_id` or `table`, or a `postgres` Check omits `query` or `dsn`
- **THEN** the response is HTTP 400 naming the missing field

### Requirement: Expectations are a simple form, not a DSL
Expectations SHALL be `min_new_records` (int, default 1), `required_fields` (list), and `non_empty_fields` (list). The default of 1 means a run that adds no records FAILs unless the user lowers it (known limitation; see change `claimed-count-reconciliation`).

#### Scenario: Defaults applied
- **WHEN** a Check is created without `expectations`
- **THEN** it stores `{min_new_records: 1, required_fields: [], non_empty_fields: []}`

### Requirement: List, read, update, delete own Checks only
The system SHALL scope every Check route to `user_id`; a Check owned by another user returns 404. The list route SHALL include the last 30 runs (oldest → newest) and `last_verdict` and SHALL omit `webhook_secret`; the detail route includes it.

#### Scenario: Cross-user access
- **WHEN** user B requests user A's Check by id
- **THEN** the response is HTTP 404 "Check not found"

#### Scenario: Update keeps stored secrets when omitted
- **WHEN** `PATCH /api/checks/{id}` sends `config` without the secret field
- **THEN** the previously encrypted secret is preserved

### Requirement: Webhook trigger runs the Check asynchronously
`POST /api/hook/{secret}` SHALL look up the Check by `webhook_secret`, queue `execute_check` as a background task with `trigger="webhook"`, and return `{accepted: true, run_id}` immediately. The request body SHALL be ignored.

#### Scenario: Valid secret
- **WHEN** a workflow POSTs to the webhook URL with any or no body
- **THEN** a run is queued and a new run appears in history within seconds

#### Scenario: Unknown secret
- **WHEN** the secret matches no Check
- **THEN** the response is HTTP 404 "Unknown webhook"

### Requirement: Manual run
`POST /api/checks/{id}/run` SHALL queue a run with `trigger="manual"` for the owner.

#### Scenario: Run now
- **WHEN** the owner clicks "Run check now"
- **THEN** a run is queued and `{run_id, status: "queued"}` is returned

### Requirement: Run history
`GET /api/checks/{id}/runs?limit=` (default 50) SHALL return runs newest-first; `GET /api/runs/{run_id}` returns one run only if the caller owns its Check. Each run stores `timestamp`, `trigger` (`webhook` | `manual` | `retry`), `verdict`, `diff_message`, `fingerprint`, `error_details`, `is_retry`.

#### Scenario: Deleting a Check deletes its runs
- **WHEN** `DELETE /api/checks/{id}` succeeds
- **THEN** all `check_runs` for that id are removed

### Requirement: Snooze
`POST /api/checks/{id}/snooze {hours: 1..168}` SHALL set `snooze_until`; `DELETE` clears it. While snoozed, runs still execute but no alert is sent.

#### Scenario: Snoozed FAIL
- **WHEN** a run FAILs while `snooze_until` is in the future
- **THEN** the run is recorded and no Slack message is posted
