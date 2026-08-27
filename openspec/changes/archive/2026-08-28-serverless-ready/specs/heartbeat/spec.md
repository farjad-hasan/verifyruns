## ADDED Requirements

### Requirement: Tick can be driven externally
`POST /api/internal/tick` with header `X-Tick-Secret` equal to `VR_TICK_SECRET` SHALL run the heartbeat sweep and the retry drain and return `{heartbeats, retries}` counts. A wrong or missing header SHALL return 401; when `VR_TICK_SECRET` is unset the endpoint SHALL return 404. The in-process ticker SHALL run only when `VR_INTERNAL_TICKER` is `1` (default). Both drivers SHALL be idempotent within a window.

#### Scenario: External scheduler
- **WHEN** cron-job.org POSTs to the endpoint with the right secret every 5 minutes
- **THEN** missed heartbeat windows and due retries are processed without any in-process timer

#### Scenario: Wrong secret
- **WHEN** the header is missing or wrong
- **THEN** the response is 401 and nothing runs
