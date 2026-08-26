## ADDED Requirements

### Requirement: Webhook can wait for the verdict
`POST /api/hook/{secret}?wait=<seconds>` (max 60) SHALL hold the response until the run completes or the wait elapses, returning `{accepted, run_id, verdict, diff_message}` when complete and `{accepted, run_id, verdict: null}` on timeout, so an integrator node can fail the calling workflow on FAIL.

#### Scenario: Node waits and fails the execution
- **WHEN** the n8n node posts with `wait=30` and the run FAILs within 30 s
- **THEN** the response carries `verdict: "FAIL"` and the node throws with the diff message
