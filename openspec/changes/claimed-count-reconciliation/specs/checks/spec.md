## MODIFIED Requirements

### Requirement: Webhook trigger runs the Check asynchronously
`POST /api/hook/{secret}` SHALL look up the Check by `webhook_secret`, queue `execute_check` as a background task with `trigger="webhook"`, and return `{accepted: true, run_id}` immediately. If the JSON body contains an integer under `wrote` (or `expected_new` / `count`), that value SHALL be passed to the run as `claimed_new`; any other body is ignored and noted on the run.

#### Scenario: Valid secret, no body
- **WHEN** a workflow POSTs to the webhook URL with no body
- **THEN** a run is queued with `claimed_new = null` and behaves per `min_new_records`

#### Scenario: Claimed count supplied
- **WHEN** the body is `{"wrote": 3}`
- **THEN** the run stores `claimed_new: 3` and the growth rule expects at least 3

#### Scenario: Unknown secret
- **WHEN** the secret matches no Check
- **THEN** the response is HTTP 404 "Unknown webhook"

### Requirement: Expectations are a simple form, not a DSL
Expectations SHALL be `min_new_records` (int ≥ 0, default 1), `required_fields` (list), `non_empty_fields` (list), and `growth_mode` (`growth` | `steady` | `claimed`, default `growth`). `min_new_records = 0` means growth is not required. `claimed` mode requires a claimed count on every webhook run.

#### Scenario: Defaults applied
- **WHEN** a Check is created without `expectations`
- **THEN** it stores `{min_new_records: 1, required_fields: [], non_empty_fields: [], growth_mode: "growth"}`

#### Scenario: Claimed mode without a body
- **WHEN** `growth_mode` is `claimed` and the webhook body carries no integer
- **THEN** the run FAILs with "Run reported success, but your workflow sent no record count (this Check expects {\"wrote\": N} in the webhook body)."
