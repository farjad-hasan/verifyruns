# webhook-wait Specification

## Purpose
How integrators get the verdict back in the same webhook request. Since `serverless-ready` the webhook always runs inline, so this is the default behaviour; `?wait` is accepted for older setups.

## Requirements

### Requirement: Webhook can wait for the verdict
`POST /api/hook/{secret}` SHALL return `{accepted, run_id, verdict, diff_message, timed_out: false}` once the run is recorded — the check runs inside the request (serverless-ready, 2026-08-28). A `wait` query parameter SHALL be accepted and ignored so older integrations and the n8n node's `?wait=30` keep working. An integrator can therefore fail the calling workflow on FAIL from the response alone.

#### Scenario: Node waits and fails the execution
- **WHEN** the n8n node posts (with or without `wait=30`) and the run FAILs
- **THEN** the response carries `verdict: "FAIL"` and the node throws with the diff message
