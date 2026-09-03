## MODIFIED Requirements

### Requirement: Public page exposes verdicts only
`GET /api/public/checks/{token}` SHALL return `name`, `connector_kind`, `last_verdict`, `checked_at` (timestamp of the newest run, or null), `heartbeat_hours` (or null), and the last 30 runs as `{id, verdict, timestamp, diff_message, trigger, alerts_sent: [{kind, ok}]}`. It SHALL NOT return config, secrets, fingerprints, `error_details`, or any alert target. The page exists so teammates can monitor a Check without an account. The rendered page SHALL label the Check with its real connector kind, SHALL state when it was last evaluated (absolute time with timezone), SHALL show the heartbeat expectation when one is set, SHALL show per-channel delivery status for the latest run, SHALL make each verdict readable without colour (a text label or glyph beside every square and row), and SHALL remain legible at a 390 px viewport without horizontal scrolling. Its header SHALL be the shared `Nav` in its `public` variant and its footer the shared slim `Footer`.

#### Scenario: Revoked token
- **WHEN** the token has been deleted
- **THEN** the response is HTTP 404

#### Scenario: Diff message is visible
- **WHEN** a viewer opens `/status/<token>`
- **THEN** each run shows its verdict and diff message, and no destination sample data

#### Scenario: Client views on a phone
- **WHEN** a viewer opens `/status/<token>` at 390 px wide
- **THEN** all 30 timeline squares are visible without horizontal scroll and every FAIL is distinguishable from PASS in greyscale

#### Scenario: Teammate opens an Airtable check
- **WHEN** a teammate opens `/status/<token>` for a Check whose `connector_kind` is `airtable` with a 28 h heartbeat
- **THEN** the page is labelled "Airtable Check", shows "as of" with the time and timezone, and "expects a run every 28 h"

#### Scenario: Alert delivery is visible, targets are not
- **WHEN** the latest run is a FAIL whose Slack alert succeeded and email alert failed
- **THEN** the page shows "alerted: slack ✓ · email ✗" and the response body contains no webhook URL or email address
