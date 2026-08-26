## 1. Tests first (pure functions)

- [ ] 1.1 Add `backend/tests/test_verdict_engine.py` importing `_fingerprint`, `_compute_verdict` directly (no HTTP)
- [ ] 1.2 Cases: first run, no-op run FAIL, growth PASS, required-field missing, disappeared field, non-empty rule, two-reason message wording
- [ ] 1.3 Case: `record_count` 2400→2403 with `sample_size` 100 PASSes (fails on current code once `_fetch_records` returns a total)

## 2. Connectors

- [ ] 2.1 Change `_fetch_records` contract to return `(records, total, error_message, error_details)`; HTTP/JSON sets `total = len(records)`
- [ ] 2.2 Airtable: `pageSize=100`, loop on `offset`, ceiling `VR_AIRTABLE_MAX_RECORDS` (default 10000), 60 s overall budget, note when capped
- [ ] 2.3 Postgres: `SET statement_timeout = 15000`; COUNT(*) statement then LIMIT 100 sample; `count_estimated` fallback on timeout
- [ ] 2.4 `_fingerprint(records, total)` sets `record_count = total`, `sample_size = len(records)`

## 3. UI

- [ ] 3.1 Run panel in `CheckDetail.jsx`: show "N records (M sampled)" when `sample_size` < `record_count`; show "count capped" / "estimated" badges from run flags

## 4. Verify on Emergent preview, then publish

- [ ] 4.1 Airtable Check against a base with >100 rows: first run PASS with true count; add a row; webhook → PASS "gained 1"
- [ ] 4.2 Postgres Check against a table with >100 rows: same sequence
- [ ] 4.3 Existing HTTP/JSON Check unchanged
- [ ] 4.4 Publish; update `memory/PRD.md` (remove "Airtable multi-page" from backlog)
