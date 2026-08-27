## Why

The "these fields must be non-empty" rule inspects `newest_record`, which is simply the last element the connector returned — Airtable view order, or an un-ordered Postgres result. So the rule checks a random row and can PASS a broken run or FAIL a healthy one. Small change, but it makes one of the three expectation rules trustworthy.

## What Changes

- Airtable: sort the fetched page(s) by `createdTime` descending before fingerprinting; `newest_record` is the true newest.
- Postgres: require an `ORDER BY` in the query for the non-empty rule; if absent, the non-empty rule is skipped and the run notes "add ORDER BY <ts> DESC to enable newest-record checks".
- HTTP/JSON: optional `config.newest_key` (field name) — when set, the record with the max value is newest; otherwise last element, as today, documented.
- Non-empty rule checks the newest **N** sampled records (default 5) rather than one, so a single odd row does not flip the verdict.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `verdict-engine`: definition of `newest_record`; non-empty rule window.
- `connectors`: Airtable ordering; Postgres ORDER BY detection; HTTP `newest_key`.

## Impact

`_fetch_records`, `_fingerprint`, `_compute_verdict`, `HttpConfig` model, NewCheck form (newest_key field), tests.
