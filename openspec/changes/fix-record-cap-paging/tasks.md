## 1. Tests first (pure functions)

- [x] 1.1 Add `backend/tests/test_verdict_engine.py` importing `_fingerprint`, `_compute_verdict` directly (no HTTP)
- [x] 1.2 Cases: first run, no-op run FAIL, growth PASS, required-field missing, disappeared field, non-empty rule, two-reason message wording
- [x] 1.3 Case: `record_count` 2400→2403 with `sample_size` 100 PASSes (fails on current code once `_fetch_records` returns a total)

## 2. Connectors

- [x] 2.1 Change `_fetch_records` contract to return `(records, total, error_message, error_details)`; HTTP/JSON sets `total = len(records)`
- [x] 2.2 Airtable: `pageSize=100`, loop on `offset`, ceiling `VR_AIRTABLE_MAX_RECORDS` (default 10000), 60 s overall budget, note when capped
- [x] 2.3 Postgres: `SET statement_timeout = 15000`; COUNT(*) statement then LIMIT 100 sample; `count_estimated` fallback on timeout
- [x] 2.4 `_fingerprint(records, total)` sets `record_count = total`, `sample_size = len(records)`

## 3. UI

- [x] 3.1 Run panel in `CheckDetail.jsx`: show "N records (M sampled)" when `sample_size` < `record_count`; show "count capped" / "estimated" badges from run flags

## 4. Verify locally, then push

- [x] 4.1 Postgres end-to-end (Docker `postgres:16`): table with 250 rows → PASS with `record_count: 250`; insert 3 rows; webhook → PASS "gained 3"
- [x] 4.2 Airtable: unit-verified offset paging and ceiling against a fake paged API (no live base available locally)
- [x] 4.3 Existing HTTP/JSON Check (jsonplaceholder todos, 200 records) unchanged before/after
- [x] 4.4 Full suite green; commit; push. Deploy target is TBD (Emergent credits exhausted 2026-08-27 — contest URL stays frozen at the current build). Update `memory/PRD.md` backlog
