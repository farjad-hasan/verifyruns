## MODIFIED Requirements

### Requirement: Alert only on state transitions
The system SHALL post to the Check's Slack webhook when a run is FAIL and `last_alerted_verdict != "FAIL"` (":rotating_light: *FAIL* — <name>"), or when a run is PASS and `last_alerted_verdict == "FAIL"` (":white_check_mark: *Recovered* — <name>"). The message body is the `diff_message`, the timestamp, and an "Open in VerifyRuns" link when `PUBLIC_APP_URL` is set. The transition SHALL be claimed with a predicated UPDATE of `last_alerted_verdict` (FAIL claims only when the stored value is not FAIL; PASS claims only when it is FAIL) *before* any delivery; a caller whose claim changed no row SHALL deliver nothing. When every channel's delivery fails, the claim SHALL be rolled back to its prior value with a predicated UPDATE (only when the stored value is still what this caller claimed), so the next run of the same streak alerts again; when at least one channel delivered, the claim stands. Snoozed Checks and Checks with no channels SHALL return before claiming, so their state does not move.

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
- **THEN** the second run claims the transition again and delivery is attempted again

#### Scenario: One of two channels fails
- **WHEN** Slack delivers and Discord times out on a fresh FAIL
- **THEN** the claim stands, `alerts_sent` records `{slack, ok: true}` and `{discord, ok: false}`, and the next FAIL of the streak sends nothing

## ADDED Requirements

### Requirement: Delivery failures are visible
A channel whose encrypted target cannot be decrypted SHALL be recorded as a delivery failure (`{kind, ok: false, error: "decrypt"}` in the run's `alerts_sent`) and logged with the check id — never silently skipped. Every failed delivery SHALL increment a persistent `meta.alert_delivery_failures` counter so an operator probe can observe that alerts are failing without reading run rows.

#### Scenario: Ciphertext corrupted
- **WHEN** a Check's Slack target fails to decrypt during a fresh FAIL
- **THEN** the run's `alerts_sent` contains `{kind: "slack", ok: false}`, the counter increments, and the transition claim is rolled back

#### Scenario: Healthy delivery
- **WHEN** all channels deliver
- **THEN** the counter does not move

### Requirement: Alert delivery does not follow redirects
Alert webhook POSTs (Slack, Discord) SHALL be sent with `redirect: "manual"`; a redirect response SHALL count as a delivery failure. Error-response bodies read for diagnostics SHALL be capped at the same size limit as connector reads.

#### Scenario: Alert URL redirects
- **WHEN** a stored alert webhook answers 302 to another host
- **THEN** the redirect is not followed and the delivery is recorded as failed
