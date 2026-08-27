## MODIFIED Requirements

### Requirement: Retry once before a fresh FAIL alert
When a non-retry run produces a fresh FAIL and `retry_before_alert` is true and the Check is not snoozed, the system SHALL record `pending_retry = {due_at: now + VR_RETRY_DELAY_SECONDS, claimed_new}` on the Check instead of alerting. The next tick whose time is past `due_at` SHALL run the Check again with `trigger="retry"` and clear `pending_retry`; the retry's verdict decides whether an alert is sent. Retry latency is the delay plus the tick interval.

#### Scenario: Transient miss
- **WHEN** the first run FAILs, the retry (on the next tick) PASSes
- **THEN** no alert is sent and both runs are visible in history

#### Scenario: Confirmed failure
- **WHEN** the first run FAILs and the retry also FAILs
- **THEN** one FAIL alert is sent

#### Scenario: Retry survives a restart
- **WHEN** the API process restarts between the FAIL and the retry
- **THEN** the retry still runs on the next tick, because it is stored on the Check
