## 1. Tests first

- [ ] 1.1 `_fingerprint` ordering cases: Airtable createdTime, HTTP newest_key, Postgres undefined
- [ ] 1.2 Non-empty rule window: outlier PASS, majority-empty FAIL, single-record window

## 2. Backend

- [ ] 2.1 Airtable branch sorts sample by `createdTime` desc
- [ ] 2.2 Postgres branch sets `newest_defined` from an `ORDER BY` regex on the guarded query
- [ ] 2.3 `HttpConfig.newest_key`; HTTP branch orders when set
- [ ] 2.4 `_fingerprint` stores `newest_window` (5) and `newest_defined`; `_compute_verdict` majority rule + skip note

## 3. Frontend

- [ ] 3.1 NewCheck HTTP form: optional "newest record key" field with helper text
- [ ] 3.2 Run panel: show the skip note when `newest_defined` is false

## 4. Verify on Emergent preview, then publish

- [ ] 4.1 Airtable base with mixed createdTime → newest shown correctly
- [ ] 4.2 Postgres query without ORDER BY → note shown, no false FAIL
- [ ] 4.3 Publish; update `memory/PRD.md`
