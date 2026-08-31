# alerts

## Purpose
Slack incoming-webhook alerts on verdict transitions, with retry-before-alert, dedup, and snooze. Email is not implemented (no platform mechanism on Emergent). As built in `execute_check`, `_schedule_retry`, `_maybe_alert`.
## Requirements
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

### Requirement: Snooze suppresses delivery
While `snooze_until` is in the future the system SHALL skip both retry scheduling and delivery, and SHALL NOT update `last_alerted_verdict`.

#### Scenario: Snooze expires during a FAIL streak
- **WHEN** snooze ends and the next run FAILs
- **THEN** a FAIL alert is sent (the streak was never alerted)

### Requirement: Alert channels are Slack only
The system SHALL store a list of alert channels per Check, each `{kind: slack | discord | email, target}` with the target Fernet-encrypted and masked to last 4; every channel SHALL receive the same transition-based FAIL and Recovered messages with identical dedup, retry and snooze semantics. A legacy single Slack field SHALL be read as a one-element list.

#### Scenario: Discord channel
- **WHEN** a fresh FAIL occurs on a Check with a Discord webhook
- **THEN** one message is POSTed to the Discord URL as `{content}`

#### Scenario: Email channel
- **WHEN** a fresh FAIL occurs on a Check with an email channel
- **THEN** one email is sent from the verified sender with the diff message and a link

#### Scenario: No channel configured
- **WHEN** a Check has no channels
- **THEN** verdicts are recorded and nothing is sent

### Requirement: Missed heartbeat alerts like any FAIL, without a retry
A heartbeat FAIL SHALL go straight to alert routing (no retry-before-alert, since there is nothing to re-fetch). It SHALL obey snooze and state-based dedup: one FAIL alert for the streak, and the next real PASS SHALL send the Recovered message.

#### Scenario: First missed window
- **WHEN** a Check with a Slack channel misses its first window and `last_alerted_verdict` is not FAIL
- **THEN** one Slack message is posted with the heartbeat message

#### Scenario: Workflow comes back
- **WHEN** a webhook run PASSes after heartbeat FAILs
- **THEN** one Recovered message is posted

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

