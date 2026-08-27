## ADDED Requirements

### Requirement: Queued webhook mode
`POST /api/hook/{secret}?wait=0` SHALL store `{run_id, claimed_new, body_note, queued_at}` in the Check's `pending_runs` and return HTTP 202 `{accepted: true, run_id, queued: true}` without reading the destination. The next tick SHALL execute queued runs in order with `trigger="webhook"` and the pre-assigned `run_id`, exactly once.

#### Scenario: Queue then drain
- **WHEN** a workflow POSTs with `?wait=0` and the tick runs a minute later
- **THEN** the reply was immediate, no run existed until the tick, and afterwards one run with that `run_id` exists

#### Scenario: Two ticks race
- **WHEN** two ticks run at the same moment
- **THEN** the queued runs execute once, not twice
