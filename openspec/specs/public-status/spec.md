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
`GET /api/public/checks/{token}` SHALL return `name`, `connector_kind`, `last_verdict`, and the last 30 runs as `{id, verdict, timestamp, diff_message, trigger}`. It SHALL NOT return config, secrets, fingerprints, or `error_details`.

#### Scenario: Revoked token
- **WHEN** the token has been deleted
- **THEN** the response is HTTP 404

#### Scenario: Diff message is visible
- **WHEN** a viewer opens `/status/<token>`
- **THEN** each run shows its verdict and diff message, and no destination sample data
