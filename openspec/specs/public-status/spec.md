# public-status

## Purpose
An unauthenticated, shareable status page per Check, keyed by a revocable token. As built in `enable_public`, `disable_public`, `public_check` and `frontend/src/pages/PublicStatus.jsx`.

## Requirements

### Requirement: Owner toggles public status
`POST /api/checks/{id}/public` SHALL create (or reuse) a 24-byte urlsafe `public_token`; `DELETE` removes it and the page stops resolving.

#### Scenario: Enable twice
- **WHEN** the owner enables public status a second time
- **THEN** the same token is returned

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

### Requirement: Public status pages are shareable, not discoverable
`/status/*` responses SHALL carry an `X-Robots-Tag: noindex` header (`frontend/public/_headers`), and the public status route SHALL also set a `noindex` robots meta tag, so status pages reach only people given the link. `robots.txt` SHALL NOT disallow `/status/` — a Disallow would stop crawlers from ever seeing the noindex, leaving shared links indexable URL-only. Enabling a public page SHALL require the same confirmation the disable action already has, naming what becomes visible (check name, verdicts, diff sentences).

#### Scenario: Crawler finds a shared link
- **WHEN** a public status URL appears on a crawled page
- **THEN** the crawler fetches it, reads the noindex header, and drops it from the index — it never becomes searchable

#### Scenario: Owner enables sharing
- **WHEN** the owner clicks Enable on the public status card
- **THEN** a confirmation states that the check name and its diff sentences become visible to anyone with the link
