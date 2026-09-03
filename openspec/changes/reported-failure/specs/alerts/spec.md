## ADDED Requirements

### Requirement: Reported failures alert without a retry
When a fresh FAIL is a reported failure, the system SHALL NOT schedule a retry-before-alert run and SHALL clear any `pending_retry` left by an earlier ordinary FAIL, because re-reading the destination cannot change what the workflow said and a passing retry would suppress the alert or send a false Recovered. Alert routing (transition claim, snooze, dedup, recovery) SHALL otherwise apply unchanged. Discord payloads SHALL carry `allowed_mentions: {parse: []}` and Slack text SHALL escape `<`, `>` and `&` in the name and message, so a workflow-supplied reason cannot ping or link anyone.

#### Scenario: First reported failure
- **WHEN** a Check with `retry_before_alert` true receives its first reported failure
- **THEN** the FAIL alert is sent on that run and `pending_retry` stays null

#### Scenario: Retry left by an earlier FAIL
- **WHEN** an ordinary FAIL has scheduled a retry and a reported failure arrives before it is due
- **THEN** `pending_retry` is null, the retry never runs, and no Recovered alert is sent

#### Scenario: Recovery
- **WHEN** the next webhook run has no reported failure and PASSes
- **THEN** a Recovered alert is sent
