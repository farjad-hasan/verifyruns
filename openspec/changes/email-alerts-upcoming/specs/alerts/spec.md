## MODIFIED Requirements

### Requirement: Multi-channel alerts
The system SHALL store a list of alert channels per Check, each `{kind: slack | discord | email, target}` with the target Fernet-encrypted and masked to last 4; every channel SHALL receive the same transition-based FAIL and Recovered messages with identical dedup, retry and snooze semantics. A legacy single Slack field SHALL be read as a one-element list. Email alert *delivery* is product-upcoming: unless `VR_EMAIL_ALERTS` is truthy, the Worker SHALL NOT send alert email via Resend for stored email channels (creation is likewise gated). Password-reset mail MAY still use Resend without `VR_EMAIL_ALERTS`.

#### Scenario: Email alert delivery stays off without the flag
- **WHEN** a FAIL transition drains an outbox event whose snapshot includes an email channel, Resend secrets are set, and `VR_EMAIL_ALERTS` is unset
- **THEN** no request is made to Resend for that channel
