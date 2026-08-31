# webhook-wait Specification

## Purpose
How integrators get the verdict back in the same webhook request. Since `serverless-ready` the webhook always runs inline, so this is the default behaviour; `?wait` is accepted for older setups.
## Requirements
### Requirement: Webhook can wait for the verdict
`POST /api/hook/{secret}` SHALL return `{accepted, run_id, verdict, diff_message, timed_out: false}` once the run is recorded — the check runs inside the request (serverless-ready, 2026-08-28). A `wait` query parameter SHALL be accepted and ignored so older integrations and the n8n node's `?wait=30` keep working. An integrator can therefore fail the calling workflow on FAIL from the response alone.

#### Scenario: Node waits and fails the execution
- **WHEN** the n8n node posts (with or without `wait=30`) and the run FAILs
- **THEN** the response carries `verdict: "FAIL"` and the node throws with the diff message

### Requirement: Queued-mode enqueue is atomic
`POST /api/hook/{secret}?wait=0` SHALL append to `pending_runs` in a single UPDATE (`json_insert`) without reading the current value, so concurrent webhooks cannot overwrite each other's queued run. If a tick swaps the queue between an append and its own read, the appended item SHALL remain queued for the next tick rather than be lost. The tick's drain SHALL be at-least-once: an item SHALL be removed from `pending_runs` only after its run has executed and been recorded, so a tick that dies mid-drain — thrown error or hard eviction — resumes the unfinished item on the next tick instead of losing it. An item whose run is already recorded (an eviction landed between execute and remove) SHALL be removed without re-executing, since run ids are primary keys; a lost run is never accepted. At most `VR_TICK_BATCH` items are processed per tick across all Checks — each execution is a destination fetch, and the invocation's subrequest budget is shared.

#### Scenario: Burst of queued webhooks
- **WHEN** ten workflows POST with `?wait=0` within the same second
- **THEN** all ten are acknowledged with 202 and all ten runs exist after the next tick

#### Scenario: Tick dies mid-drain
- **WHEN** the tick is terminated after executing two of five queued runs
- **THEN** the remaining three are still in `pending_runs` and execute on the next tick

#### Scenario: Eviction between execute and remove
- **WHEN** the tick executes an item and is evicted before removing it from the queue
- **THEN** the next tick finds the item's run already recorded and removes it from the queue — no run is missing and no second destination fetch happens

#### Scenario: Queue longer than the batch
- **WHEN** a Check has more queued runs than the per-tick batch
- **THEN** the batch executes this tick and the tail stays queued for the next

