## MODIFIED Requirements

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
