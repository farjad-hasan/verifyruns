## MODIFIED Requirements

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
