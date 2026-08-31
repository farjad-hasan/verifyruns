## MODIFIED Requirements

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
