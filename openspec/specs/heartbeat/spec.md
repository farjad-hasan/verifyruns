# heartbeat Specification

## Purpose
Catching the workflow that never ran: a per-Check expected cadence, a synthetic FAIL run once per missed window, and the tick that drives it — in-process or from an external scheduler.

## Requirements

### Requirement: Missed heartbeat is a FAIL run
When a Check has `heartbeat_hours` set, the system SHALL insert a synthetic FAIL run with `trigger="heartbeat"` once `now − last run timestamp` exceeds `heartbeat_hours`, at most once per missed window, with the message "No run in <elapsed> h — expected one every <heartbeat_hours> h." The insert SHALL be guarded in the same statement against a heartbeat already recorded inside the window, so concurrent ticks (cron, lazy, manual) produce one run and one alert, not one per tick.

#### Scenario: Workflow never fired
- **WHEN** `heartbeat_hours` is 24 and the last run was 26 h ago
- **THEN** one heartbeat FAIL run is recorded and alert routing treats it as a fresh FAIL

#### Scenario: Real run recovers
- **WHEN** a webhook run PASSes after a heartbeat FAIL
- **THEN** a Recovered alert is sent per the alerts rules

#### Scenario: Two ticks at the same instant
- **WHEN** the cron tick and a lazy tick both evaluate a Check whose window has just been missed
- **THEN** exactly one heartbeat run exists and exactly one FAIL alert is delivered

### Requirement: Tick can be driven externally
`POST /api/internal/tick` with header `X-Tick-Secret` equal to `VR_TICK_SECRET` SHALL run the heartbeat sweep and the retry drain and return `{heartbeats, retries}` counts. A wrong or missing header SHALL return 401; when `VR_TICK_SECRET` is unset the endpoint SHALL return 404. The in-process ticker SHALL run only when `VR_INTERNAL_TICKER` is `1` (default). Both drivers SHALL be idempotent within a window.

#### Scenario: External scheduler
- **WHEN** cron-job.org POSTs to the endpoint with the right secret every 5 minutes
- **THEN** missed heartbeat windows and due retries are processed without any in-process timer

#### Scenario: Wrong secret
- **WHEN** the header is missing or wrong
- **THEN** the response is 401 and nothing runs

### Requirement: Traffic can drive the tick
On any API request, if more than `VR_LAZY_TICK_SECONDS` (default 60; `0` disables) have passed since the last tick, the system SHALL claim the tick atomically in the database and run it in the background after the response. Concurrent requests SHALL NOT produce more than one tick per window, and the scheduler endpoint and internal loop SHALL stamp the same timestamp so traffic does not tick right after them.

#### Scenario: Busy instance
- **WHEN** the last tick was 2 minutes ago and a dashboard request arrives
- **THEN** exactly one tick runs after that response and the timestamp advances

#### Scenario: Quiet instance
- **WHEN** no request arrives for 10 minutes
- **THEN** the external scheduler's call is what runs the tick
