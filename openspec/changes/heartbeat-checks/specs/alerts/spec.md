## ADDED Requirements

### Requirement: Missed heartbeat alerts like any FAIL, without a retry
A heartbeat FAIL SHALL go straight to alert routing (no retry-before-alert, since there is nothing to re-fetch). It SHALL obey snooze and state-based dedup: one FAIL alert for the streak, and the next real PASS SHALL send the Recovered message.

#### Scenario: First missed window
- **WHEN** a Check with a Slack channel misses its first window and `last_alerted_verdict` is not FAIL
- **THEN** one Slack message is posted with the heartbeat message

#### Scenario: Workflow comes back
- **WHEN** a webhook run PASSes after heartbeat FAILs
- **THEN** one Recovered message is posted
