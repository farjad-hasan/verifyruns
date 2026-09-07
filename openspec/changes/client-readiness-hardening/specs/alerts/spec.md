## MODIFIED Requirements

### Requirement: Alert only on state transitions
The system SHALL post to the Check's Slack webhook when a run is FAIL and `last_alerted_verdict != "FAIL"` (":rotating_light: *FAIL* — <name>"), or when a run is PASS and `last_alerted_verdict == "FAIL"` (":white_check_mark: *Recovered* — <name>"). The message body is the `diff_message`, the timestamp, and an "Open in VerifyRuns" link when `PUBLIC_APP_URL` is set. The transition and its durable outbox job SHALL be persisted atomically before delivery; run persistence SHALL include this operation where a new run creates a transition. One job SHALL be enqueued for each transition, preserving per-Check order. Workers SHALL lease jobs before delivery and retry after interruption or refusal, independently of subsequent workflow runs. A pending FAIL SHALL suppress duplicate FAIL jobs, and recovery SHALL wait behind it. At least one accepted channel completes an event; already acknowledged channels SHALL not be sent again. Snoozed Checks and Checks with no channels SHALL not enqueue new transitions; queued delivery SHALL respect snooze and removed channels. Deleting a Check SHALL delete its queued notifications. External delivery SHALL be at-least-once because acceptance can precede durable acknowledgement. `alerts_sent` SHALL remain the provider evidence; the transition field is not a receipt guarantee.

#### Scenario: Consecutive FAILs
- **WHEN** three runs FAIL in a row
- **THEN** exactly one FAIL alert is sent

#### Scenario: Recovery
- **WHEN** a PASS follows an alerted FAIL
- **THEN** one "Recovered" message is sent and `last_alerted_verdict` becomes PASS

#### Scenario: Two runs finish together
- **WHEN** a retry and a webhook run both FAIL at the same instant on a Check that has not alerted
- **THEN** one FAIL alert is delivered, not two

#### Scenario: Every channel fails, then the Check FAILs again
- **WHEN** the only Slack webhook answers 404 on a fresh FAIL and the next run also FAILs
- **THEN** the original event stays queued and the scheduler retries delivery without needing another workflow run

#### Scenario: One of two channels fails
- **WHEN** Slack delivers and Discord times out on a fresh FAIL
- **THEN** the claim stands, `alerts_sent` records `{slack, ok: true}` and `{discord, ok: false}`, and the next FAIL of the streak sends nothing

#### Scenario: Worker dies during delivery
- **WHEN** a delivery lease expires after an interrupted attempt
- **THEN** another worker can retry the same event without losing the alert

#### Scenario: Provider and database fail
- **WHEN** delivery fails and saving the outcome also fails
- **THEN** the persisted event remains retryable and is not permanently muted

### Requirement: Delivery failures are visible
A channel whose encrypted target cannot be decrypted SHALL be recorded as a delivery failure (`{kind, ok: false, error: "decrypt"}` in the run's `alerts_sent`) and logged with the check id — never silently skipped. Every failed delivery SHALL increment a persistent `meta.alert_delivery_failures` counter so an operator probe can observe that alerts are failing without reading run rows.

#### Scenario: Ciphertext corrupted
- **WHEN** a Check's Slack target fails to decrypt during a fresh FAIL
- **THEN** the run's `alerts_sent` contains `{kind: "slack", ok: false}`, the counter increments, and the event remains queued for retry

#### Scenario: Healthy delivery
- **WHEN** all channels deliver
- **THEN** the counter does not move
