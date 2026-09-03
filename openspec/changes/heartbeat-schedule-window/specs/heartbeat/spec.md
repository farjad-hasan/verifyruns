## MODIFIED Requirements

### Requirement: Missed heartbeat is a FAIL run
When a Check has `heartbeat_hours` set, the system SHALL insert a synthetic FAIL run with `trigger="heartbeat"` once the Check's `next_heartbeat_due_at` has passed, at most once per missed window, with the message "No run in <elapsed> h — expected one every <heartbeat_hours> h." When the Check also has a `heartbeat_window`, the message SHALL append " (active <start>–<end> <tz>)" and, if `days` is set, the day names. The insert SHALL be guarded in the same statement against a heartbeat already recorded inside the window, so concurrent ticks (cron, lazy, manual) produce one run and one alert, not one per tick.

#### Scenario: Workflow never fired
- **WHEN** `heartbeat_hours` is 24 and the last run was 26 h ago
- **THEN** one heartbeat FAIL run is recorded and alert routing treats it as a fresh FAIL

#### Scenario: Real run recovers
- **WHEN** a webhook run PASSes after a heartbeat FAIL
- **THEN** a Recovered alert is sent per the alerts rules

#### Scenario: Two ticks at the same instant
- **WHEN** the cron tick and a lazy tick both evaluate a Check whose window has just been missed
- **THEN** exactly one heartbeat run exists and exactly one FAIL alert is delivered

#### Scenario: Windowed message
- **WHEN** a Check with `heartbeat_hours` 1 and window 13:00–23:00 Asia/Karachi misses its 14:00 due time
- **THEN** the FAIL message ends with "(active 13:00–23:00 Asia/Karachi)"

## ADDED Requirements

### Requirement: Heartbeat clock stops outside the active window
A Check MAY carry `heartbeat_window` (`start`, `end` as `HH:MM`, `tz` as an IANA zone, optional `days` as a non-empty subset of 0–6 with 0 = Sunday). The next due time SHALL be the instant at which `heartbeat_hours` of *active* time have elapsed since the anchor (the latest real run, else the Check's creation, never earlier than the last fired heartbeat), where active time is the union of the daily windows on the allowed days in `tz`. A window whose `end` is not after its `start` SHALL wrap past midnight. The same function SHALL compute the value at every write site of `next_heartbeat_due_at` (Check insert, run insert, heartbeat fire, `heartbeat_hours` or `heartbeat_window` PATCH). A null window SHALL reproduce the flat `+heartbeat_hours` arithmetic exactly. A windowed Check SHALL never fall back to flat arithmetic: the walk covers 400 calendar days and validation refuses any cadence not reachable inside it. A wall-clock time that does not exist (spring-forward gap) SHALL resolve to the transition instant, so a window straddling the gap keeps its real length and one inside the gap has zero length that day.

#### Scenario: Overnight gap is not a miss
- **WHEN** an hourly Check with window 13:00–23:00 records a run at 22:30 local
- **THEN** its next due time is 13:30 local the next day (the 30 min left before close plus 30 min after it reopens), and no heartbeat fires overnight

#### Scenario: Missed run inside the window still fires
- **WHEN** the same Check records nothing after its 14:00 due time
- **THEN** a heartbeat FAIL fires at 14:00 local, not at the next window open

#### Scenario: Weekend is skipped
- **WHEN** a 2 h Check with window Mon–Fri 09:00–17:00 records a run Friday 16:00
- **THEN** its next due time is Monday 10:00 in the Check's timezone

#### Scenario: Wrapping window
- **WHEN** a 1 h Check has window 22:00–06:00 and records a run at 05:30
- **THEN** its next due time is 22:30 the same day

#### Scenario: No window
- **WHEN** a Check has `heartbeat_hours` 24 and no window
- **THEN** the due time is exactly 24 h after the anchor, as before
