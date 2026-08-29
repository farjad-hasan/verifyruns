## MODIFIED Requirements

### Requirement: Alert only on state transitions
The system SHALL post to the Check's Slack webhook when a run is FAIL and `last_alerted_verdict != "FAIL"` (":rotating_light: *FAIL* — <name>"), or when a run is PASS and `last_alerted_verdict == "FAIL"` (":white_check_mark: *Recovered* — <name>"). The message body is the `diff_message`, the timestamp, and an "Open in VerifyRuns" link when `PUBLIC_APP_URL` is set. The transition SHALL be claimed with a predicated UPDATE of `last_alerted_verdict` (FAIL claims only when the stored value is not FAIL; PASS claims only when it is FAIL) *before* any delivery; a caller whose claim changed no row SHALL deliver nothing. Snoozed Checks and Checks with no channels SHALL return before claiming, so their state does not move.

#### Scenario: Consecutive FAILs
- **WHEN** three runs FAIL in a row
- **THEN** exactly one FAIL alert is sent

#### Scenario: Recovery
- **WHEN** a PASS follows an alerted FAIL
- **THEN** one "Recovered" message is sent and `last_alerted_verdict` becomes PASS

#### Scenario: Two runs finish together
- **WHEN** a retry and a webhook run both FAIL at the same instant on a Check that has not alerted
- **THEN** one FAIL alert is delivered, not two
