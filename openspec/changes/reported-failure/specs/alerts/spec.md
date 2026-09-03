## ADDED Requirements

### Requirement: Reported failures alert without a retry
When a fresh FAIL is a reported failure, the system SHALL NOT schedule a retry-before-alert run, because re-reading the destination cannot change what the workflow said and a passing retry would suppress the alert. Alert routing (transition claim, snooze, dedup, recovery) SHALL otherwise apply unchanged.

#### Scenario: First reported failure
- **WHEN** a Check with `retry_before_alert` true receives its first reported failure
- **THEN** the FAIL alert is sent on that run and `pending_retry` stays null

#### Scenario: Recovery
- **WHEN** the next webhook run has no reported failure and PASSes
- **THEN** a Recovered alert is sent
