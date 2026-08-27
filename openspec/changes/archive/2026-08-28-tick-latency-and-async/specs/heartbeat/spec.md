## ADDED Requirements

### Requirement: Traffic can drive the tick
On any API request, if more than `VR_LAZY_TICK_SECONDS` (default 60; `0` disables) have passed since the last tick, the system SHALL claim the tick atomically in the database and run it in the background after the response. Concurrent requests SHALL NOT produce more than one tick per window, and the scheduler endpoint and internal loop SHALL stamp the same timestamp so traffic does not tick right after them.

#### Scenario: Busy instance
- **WHEN** the last tick was 2 minutes ago and a dashboard request arrives
- **THEN** exactly one tick runs after that response and the timestamp advances

#### Scenario: Quiet instance
- **WHEN** no request arrives for 10 minutes
- **THEN** the external scheduler's call is what runs the tick
