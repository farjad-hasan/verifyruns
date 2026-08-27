## MODIFIED Requirements

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
