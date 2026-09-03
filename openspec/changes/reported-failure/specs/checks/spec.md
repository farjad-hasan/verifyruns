## MODIFIED Requirements

### Requirement: Webhook trigger runs the Check asynchronously
`POST /api/hook/{secret}` SHALL look up the Check by `webhook_secret`, run the check **inline**, and return `{accepted: true, run_id, verdict, diff_message, timed_out: false}` once the run is recorded. If the JSON body contains an integer under `wrote` (or `expected_new` / `count`), that value SHALL be passed to the run as `claimed_new`; any other body is ignored and noted on the run. If the body contains `"status": "failed"`, the run SHALL be recorded as a reported failure with the optional `error` string (trimmed to 500 characters); any other `status` value SHALL be ignored. A `wait` query parameter SHALL be accepted and ignored.

#### Scenario: Valid secret
- **WHEN** a workflow POSTs to the webhook URL with any or no body
- **THEN** the response carries the verdict and the run already exists in history

#### Scenario: Claimed count supplied
- **WHEN** the body is `{"wrote": 3}`
- **THEN** the run stores `claimed_new: 3` and the growth rule expects at least 3

#### Scenario: Unknown secret
- **WHEN** the secret matches no Check
- **THEN** the response is HTTP 404 "Unknown webhook"

#### Scenario: Reported failure
- **WHEN** the body is `{"status": "failed", "error": "exit 1"}`
- **THEN** the run is a FAIL with the message "Your workflow reported failure: exit 1." and stores `reported_failure: true`, `reported_error: "exit 1"`

#### Scenario: Reported failure without a reason
- **WHEN** the body is `{"status": "failed"}`
- **THEN** the run is a FAIL with the message "Your workflow reported failure (no reason given)."

#### Scenario: Other status values
- **WHEN** the body is `{"status": "ok", "wrote": 2}`
- **THEN** the run is judged on the destination exactly as if `status` were absent

## ADDED Requirements

### Requirement: A reported failure is a FAIL with the destination still read
When a webhook run carries a reported failure, the system SHALL still read and fingerprint the destination and store the fingerprint on the run, SHALL set the verdict to FAIL regardless of the destination result, SHALL keep the run out of the PASS baseline, and SHALL re-anchor the heartbeat like any real run. Queued (`?wait=0`) runs SHALL carry the reported failure to execution. Run reads SHALL include `reported_failure` (boolean) and `reported_error` (string or null).

#### Scenario: Destination fine, workflow says failed
- **WHEN** the destination gained the claimed rows and the body says `status: failed`
- **THEN** the run is a FAIL and the following run's baseline does not include it

#### Scenario: Queued reported failure
- **WHEN** `?wait=0` is used with `{"status": "failed"}`
- **THEN** the run executed by the next tick is a reported failure
