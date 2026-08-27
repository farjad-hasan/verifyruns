## ADDED Requirements

### Requirement: Heartbeat cadence on a Check
A Check MAY carry `heartbeat_hours` (integer 1–720, default null = off), settable at creation and via `PATCH /api/checks/{id}` (null clears it). The value SHALL be returned on the Check and shown on the dashboard row and detail page.

#### Scenario: Set at creation
- **WHEN** `POST /api/checks` carries `heartbeat_hours: 24`
- **THEN** the created Check returns `heartbeat_hours: 24`

#### Scenario: Cleared
- **WHEN** `PATCH /api/checks/{id}` carries `heartbeat_hours: null`
- **THEN** the Check returns `heartbeat_hours: null` and the ticker ignores it

#### Scenario: Out of range
- **WHEN** `heartbeat_hours` is 0 or 1000
- **THEN** the request is rejected with HTTP 422

### Requirement: Heartbeat runs are a distinct trigger
Runs SHALL carry `trigger` values `webhook`, `manual`, `retry`, or `heartbeat`; heartbeat runs count as runs in history and on the timeline, but SHALL NOT serve as the anchor for the next heartbeat window.

#### Scenario: Timeline shows the outage
- **WHEN** a workflow stays silent for three windows
- **THEN** three heartbeat FAIL runs appear on the timeline, one per window
