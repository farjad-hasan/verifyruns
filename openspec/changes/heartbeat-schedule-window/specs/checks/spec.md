## ADDED Requirements

### Requirement: Heartbeat window is validated and returned
`POST /api/checks` and `PATCH /api/checks/{id}` SHALL accept `heartbeat_window` as null or `{start, end, tz, days?}`. `start` and `end` SHALL match `HH:MM` (24 h); `tz` SHALL be a zone `Intl.DateTimeFormat` accepts; `days`, when present, SHALL be a non-empty array of distinct integers 0–6. A window without `heartbeat_hours` SHALL be refused as a validation error (HTTP 422, the code the existing `heartbeat_hours` checks use) naming `heartbeat_hours`; clearing `heartbeat_hours` SHALL also clear the window. Any change to either field SHALL recompute `next_heartbeat_due_at`. Detail, list and dashboard reads SHALL include `heartbeat_window`.

#### Scenario: Window without cadence
- **WHEN** a Check is created with `heartbeat_window` set and `heartbeat_hours` null
- **THEN** the response is HTTP 422 naming `heartbeat_hours`

#### Scenario: Bad timezone
- **WHEN** `tz` is "Mars/Olympus"
- **THEN** the response is HTTP 422 naming `heartbeat_window.tz`

#### Scenario: Cadence cleared
- **WHEN** `PATCH` sets `heartbeat_hours` to null on a windowed Check
- **THEN** the stored `heartbeat_window` is null and `next_heartbeat_due_at` is null
