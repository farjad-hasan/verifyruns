# alerts

## Purpose
Slack incoming-webhook alerts on verdict transitions, with retry-before-alert, dedup, and snooze. Email is not implemented (no platform mechanism on Emergent). As built in `execute_check`, `_schedule_retry`, `_maybe_alert`.

## Requirements

### Requirement: Alert only on state transitions
The system SHALL post to the Check's Slack webhook when a run is FAIL and `last_alerted_verdict != "FAIL"` (":rotating_light: *FAIL* — <name>"), or when a run is PASS and `last_alerted_verdict == "FAIL"` (":white_check_mark: *Recovered* — <name>"). The message body is the `diff_message`, the timestamp, and an "Open in VerifyRuns" link when `PUBLIC_APP_URL` is set. `last_alerted_verdict` is persisted only after a delivery attempt.

#### Scenario: Consecutive FAILs
- **WHEN** three runs FAIL in a row
- **THEN** exactly one FAIL alert is sent

#### Scenario: Recovery
- **WHEN** a PASS follows an alerted FAIL
- **THEN** one "Recovered" message is sent and `last_alerted_verdict` becomes PASS

### Requirement: Retry once before a fresh FAIL alert
When a non-retry run produces a fresh FAIL and `retry_before_alert` is true and the Check is not snoozed, the system SHALL sleep `VR_RETRY_DELAY_SECONDS` (default 30) in-process and run again with `trigger="retry"`; the retry's verdict decides whether an alert is sent. The retry is an `asyncio` task in the web process and is lost on restart.

#### Scenario: Transient miss
- **WHEN** the first run FAILs and the retry PASSes
- **THEN** no alert is sent and both runs are visible in history

#### Scenario: Confirmed failure
- **WHEN** the first run FAILs and the retry also FAILs
- **THEN** one FAIL alert is sent

### Requirement: Snooze suppresses delivery
While `snooze_until` is in the future the system SHALL skip both retry scheduling and delivery, and SHALL NOT update `last_alerted_verdict`.

#### Scenario: Snooze expires during a FAIL streak
- **WHEN** snooze ends and the next run FAILs
- **THEN** a FAIL alert is sent (the streak was never alerted)

### Requirement: Alert channels are Slack only
The system SHALL store one Slack incoming-webhook URL per Check, Fernet-encrypted, masked to last 4, clearable via `clear_alert_slack`. No email, Discord, or other channel exists (see change `email-and-discord-alerts`).

#### Scenario: No channel configured
- **WHEN** a Check has no Slack URL
- **THEN** verdicts are recorded and nothing is sent
