## Why

Found while verifying `fix-record-cap-paging` (2026-08-27): a Postgres Check's detail page is labelled "HTTP / JSON check" and its Destination card shows GET URL / JSON path / bearer token fields instead of the query and masked DSN. Users cannot see what a Postgres Check watches, and the label is wrong. Airtable appears to be handled; Postgres landed in the backend without the matching card.

**Activation trigger:** now — small, no product risk.

## What Changes

- `CheckDetail.jsx`: connector-aware header label and Destination card for `postgres` (query in a mono block, DSN masked to last 4 via `has_dsn` / `dsn_last4`).
- Dashboard row shows "Postgres" as the connector type.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `checks`: the detail view SHALL render connector-specific destination fields for every supported connector.

## Impact

`frontend/src/pages/CheckDetail.jsx`, `Dashboard.jsx`; no backend change (the sanitised config already exposes `query`, `has_dsn`, `dsn_last4`).
