## Why

Any Airtable table or Postgres query with 100 or more rows shows a red timeline forever: the Airtable connector stops at `maxRecords=100` and the Postgres connector wraps the query in `LIMIT 100`, so `record_count` plateaus at 100, the growth delta against the last PASS becomes 0, and with the default "at least 1 new record" every later run FAILs. This is a guaranteed false alarm on exactly the tables people would pay to watch, and a contest judge or voter who points VerifyRuns at a real base hits it within two runs. Fix first, before any distribution push.

## What Changes

- Airtable: follow the `offset` cursor until exhausted (page size 100, hard ceiling configurable, default 10,000) so `record_count` is the true row count.
- Postgres: compute the count with `SELECT COUNT(*) FROM (<query>) AS _vr` and keep `LIMIT 100` only for the sample used for field names, null rates and the newest record.
- HTTP/JSON: unchanged (no cap of its own); document that paginated endpoints must expose a full array or a total.
- Fingerprint gains `sample_size` next to `record_count` so the UI can say "250 records, 100 sampled".
- Pure-function tests for `_fingerprint` / `_compute_verdict` land in the same change.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `connectors`: Airtable and Postgres requirements change from "reads at most 100" to "reads the true count".
- `verdict-engine`: the fingerprint carries `sample_size`; the "count plateau" scenario is removed.

## Impact

`backend/server.py` `_fetch_records` (airtable, postgres branches), `_fingerprint`; `frontend/src/pages/CheckDetail.jsx` run panel (show sampled vs total); `backend/tests/` gains `test_verdict_engine.py`. No data migration: old runs keep `record_count` as recorded; the first run after deploy compares a true count against a capped baseline and may FAIL once with a large positive delta — acceptable, and the message explains it.
