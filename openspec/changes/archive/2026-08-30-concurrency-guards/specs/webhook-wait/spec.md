## ADDED Requirements

### Requirement: Queued-mode enqueue is atomic
`POST /api/hook/{secret}?wait=0` SHALL append to `pending_runs` in a single UPDATE (`json_insert`) without reading the current value, so concurrent webhooks cannot overwrite each other's queued run. If a tick swaps the queue between an append and its own read, the appended item SHALL remain queued for the next tick rather than be lost.

#### Scenario: Burst of queued webhooks
- **WHEN** ten workflows POST with `?wait=0` within the same second
- **THEN** all ten are acknowledged with 202 and all ten runs exist after the next tick
