# checks

## Purpose
A Check is one destination plus expectations, owned by a user, with a secret webhook URL and a history of runs. As built in `backend/server.py` (Check CRUD, runs, webhook).

## Requirements

### Requirement: Create a Check
The system SHALL create a Check with a name (1–120 chars), a `connector_kind` (`http_json` | `airtable` | `postgres`), a per-connector `config`, `expectations`, an optional Slack webhook, a `retry_before_alert` flag (default true), and a 32-byte urlsafe `webhook_secret`. Connector secrets in `config` SHALL be stored encrypted with AES-256-GCM under `ENC_KEY` and never returned in full.

#### Scenario: Create HTTP/JSON Check with bearer token
- **WHEN** `POST /api/checks` carries `config.url` and `config.bearer_token`
- **THEN** the stored config holds `bearer_token_encrypted` and the response shows only `has_bearer_token: true` and `bearer_token_last4`

#### Scenario: Missing required config
- **WHEN** an `airtable` Check omits `base_id` or `table`, or a `postgres` Check omits `query` or `dsn`
- **THEN** the response is HTTP 400 naming the missing field

### Requirement: Expectations are a simple form, not a DSL
Expectations SHALL be `min_new_records` (int ≥ 0, default 1), `required_fields` (list), `non_empty_fields` (list), and `growth_mode` (`growth` | `steady` | `claimed`, default `growth`). `min_new_records = 0` means growth is not required. `claimed` mode requires a claimed count on every webhook run.

#### Scenario: Defaults applied
- **WHEN** a Check is created without `expectations`
- **THEN** it stores `{min_new_records: 1, required_fields: [], non_empty_fields: [], growth_mode: "growth"}`

#### Scenario: Claimed mode without a body
- **WHEN** `growth_mode` is `claimed` and the webhook body carries no integer
- **THEN** the run FAILs with "Run reported success, but your workflow sent no record count (this Check expects {\"wrote\": N} in the webhook body)."

### Requirement: List, read, update, delete own Checks only
The system SHALL scope every Check route to `user_id`; a Check owned by another user returns 404. The list route SHALL include the last 30 runs (oldest → newest) as `{id, verdict, timestamp, diff_message}` and `last_verdict` and SHALL omit `webhook_secret`; the detail route includes it. On update, an unknown `connector_kind` SHALL be refused with 400, and a `connector_kind` different from the stored one SHALL be refused with 400 unless the same request carries a `config` for the new kind.

#### Scenario: Cross-user access
- **WHEN** user B requests user A's Check by id
- **THEN** the response is HTTP 404 "Check not found"

#### Scenario: Update keeps stored secrets when omitted
- **WHEN** `PATCH /api/checks/{id}` sends `config` without the secret field
- **THEN** the previously encrypted secret is preserved

#### Scenario: Kind change without config
- **WHEN** `PATCH /api/checks/{id}` sends `connector_kind: "airtable"` and no `config` on an `http_json` Check
- **THEN** the response is HTTP 400 "config is required when changing connector_kind" and the Check is unchanged

#### Scenario: Dashboard row carries the sentence
- **WHEN** a user lists their Checks
- **THEN** each Check's newest recent run includes its `diff_message`, so the dashboard can show the sentence without a second request

### Requirement: Webhook trigger runs the Check asynchronously
`POST /api/hook/{secret}` SHALL look up the Check by `webhook_secret`, run the check **inline**, and return `{accepted: true, run_id, verdict, diff_message, timed_out: false}` once the run is recorded. If the JSON body contains an integer under `wrote` (or `expected_new` / `count`), that value SHALL be passed to the run as `claimed_new`; any other body is ignored and noted on the run. A `wait` query parameter SHALL be accepted and ignored.

#### Scenario: Valid secret
- **WHEN** a workflow POSTs to the webhook URL with any or no body
- **THEN** the response carries the verdict and the run already exists in history

#### Scenario: Claimed count supplied
- **WHEN** the body is `{"wrote": 3}`
- **THEN** the run stores `claimed_new: 3` and the growth rule expects at least 3

#### Scenario: Unknown secret
- **WHEN** the secret matches no Check
- **THEN** the response is HTTP 404 "Unknown webhook"

### Requirement: Manual run
`POST /api/checks/{id}/run` SHALL queue a run with `trigger="manual"` for the owner.

#### Scenario: Run now
- **WHEN** the owner clicks "Run Check now"
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

### Requirement: Detail view is connector-aware
The Check detail page SHALL label the Check with its connector kind and SHALL render a Destination card specific to that connector: HTTP/JSON (URL with every query-string value masked to its last four characters, JSON path, masked bearer), Airtable (base, table, view, masked PAT), Postgres (query, masked DSN). The label spells the entity "Check", as `PRODUCT.md` records.

#### Scenario: Postgres Check
- **WHEN** the owner opens a Check whose `connector_kind` is `postgres`
- **THEN** the header reads "Postgres Check" and the Destination card shows the query and the DSN masked to its last 4 characters

#### Scenario: HTTP/JSON Check with a key in the query string
- **WHEN** the owner opens a Check whose GET URL is `https://host/rest/v1/t?select=id&apikey=abcdefgh1234`
- **THEN** the Destination card shows `https://host/rest/v1/t?select=••••id&apikey=••••1234`, and the sanitised Check returned by `GET /api/checks/{id}` carries the URL already masked

### Requirement: Heartbeat cadence on a Check
A Check MAY carry `heartbeat_hours` (integer 1–720, default null = off), settable at creation and via `PATCH /api/checks/{id}` (null clears it). The value SHALL be returned on the Check and shown on the dashboard row and detail page.

#### Scenario: Set at creation
- **WHEN** `POST /api/checks` carries `heartbeat_hours: 24`
- **THEN** the created Check returns `heartbeat_hours: 24`

#### Scenario: Cleared
- **WHEN** `PATCH /api/checks/{id}` carries `heartbeat_hours: null`
- **THEN** the Check returns `heartbeat_hours: null` and the ticker ignores it

#### Scenario: Out of range
- **WHEN** `heartbeat_hours` is 0 or 1000
- **THEN** the request is rejected with HTTP 422

### Requirement: Heartbeat runs are a distinct trigger
Runs SHALL carry `trigger` values `webhook`, `manual`, `retry`, or `heartbeat`; heartbeat runs count as runs in history and on the timeline, but SHALL NOT serve as the anchor for the next heartbeat window.

#### Scenario: Timeline shows the outage
- **WHEN** a workflow stays silent for three windows
- **THEN** three heartbeat FAIL runs appear on the timeline, one per window

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

### Requirement: Runs record delivery attempts
After alert routing, a run SHALL carry `alerts_sent: [{kind, ok}]` — one entry per channel attempted — so the owner can see that an alert went out.

#### Scenario: Two channels, one down
- **WHEN** a fresh FAIL is delivered to Slack (2xx) and Discord (5xx)
- **THEN** the run shows `alerts_sent: [{kind: "slack", ok: true}, {kind: "discord", ok: false}]`

### Requirement: Sample storage is opt-in per Check
A Check SHALL carry `store_samples` (boolean, default false), settable at creation and via PATCH. Only when true SHALL runs keep the newest record, the newest window and upstream error bodies, in a `run_samples` document that expires about 30 days after the run.

#### Scenario: Default Check
- **WHEN** a run completes on a Check with `store_samples: false`
- **THEN** `GET /api/runs/{id}` has no `sample`, the fingerprint has `newest_hash` and `sample_stored: false`, and `error_details` is null

#### Scenario: Opt-in Check
- **WHEN** a run completes on a Check with `store_samples: true`
- **THEN** `GET /api/runs/{id}` includes `sample.newest_record`, `sample.newest_window` and `sample.expires_at` roughly 30 days ahead

### Requirement: Account deletion
`DELETE /api/auth/me` SHALL delete the caller's samples, runs, Checks and user record; the token SHALL stop working immediately.

#### Scenario: Delete account
- **WHEN** an authenticated user calls `DELETE /api/auth/me`
- **THEN** subsequent requests with the same token return 401 and none of the user's Checks resolve

### Requirement: Queued webhook mode
`POST /api/hook/{secret}?wait=0` SHALL store `{run_id, claimed_new, body_note, queued_at}` in the Check's `pending_runs` and return HTTP 202 `{accepted: true, run_id, queued: true}` without reading the destination. The next tick SHALL execute queued runs in order with `trigger="webhook"` and the pre-assigned `run_id`, exactly once.

#### Scenario: Queue then drain
- **WHEN** a workflow POSTs with `?wait=0` and the tick runs a minute later
- **THEN** the reply was immediate, no run existed until the tick, and afterwards one run with that `run_id` exists

#### Scenario: Two ticks race
- **WHEN** two ticks run at the same moment
- **THEN** the queued runs execute once, not twice

### Requirement: Creation defaults cannot manufacture a first-run FAIL
The New Check form SHALL default `min_new_records` to 0 ("growth optional") with helper copy explaining that 1 asserts every run adds a record; growth mode remains the default mode. A user who changes nothing SHALL get a PASS on an honest run that wrote nothing.

#### Scenario: Untouched defaults, zero-growth run
- **WHEN** a Check is created with untouched expectation defaults and its first webhook run finds an unchanged destination
- **THEN** the verdict is PASS

#### Scenario: User asserts growth
- **WHEN** the user sets `min_new_records` to 1
- **THEN** behaviour is exactly today's: an unchanged destination FAILs
