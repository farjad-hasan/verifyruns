## 1. Tests first

- [x] 1.1 `_fingerprint` ordering cases: Airtable createdTime, HTTP newest_key, Postgres undefined
- [x] 1.2 Non-empty rule window: outlier PASS, majority-empty FAIL, single-record window

## 2. Backend

- [x] 2.1 Airtable branch sorts sample by `createdTime` desc
- [x] 2.2 Postgres branch sets `newest_defined` from an `ORDER BY` regex on the guarded query
- [x] 2.3 `HttpConfig.newest_key`; HTTP branch orders when set
- [x] 2.4 `_fingerprint` stores `newest_window` (5) and `newest_defined`; `_compute_verdict` majority rule + skip note

## 3. Frontend

- [x] 3.1 NewCheck HTTP form: optional "newest record key" field with helper text
- [x] 3.2 Run panel: show the skip note when `newest_defined` is false

## 4. Verify locally, then push

- [x] 4.1 Airtable ordering by `createdTime` unit-verified against a fake API (no live base locally)
- [x] 4.2 Postgres with and without ORDER BY verified end-to-end against Docker `postgres:16`
- [x] 4.3 Full suite green; production build compiles; new-check field checked in Edge
- [x] 4.4 Commit; push; update `memory/PRD.md`
