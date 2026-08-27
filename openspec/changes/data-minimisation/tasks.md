## 1. Tests first

- [x] 1.1 Pure: `_canonical_hash` is key-order independent; `_split_sample(fp, err, store_samples=False)` strips rows, adds `newest_hash` + `sample_stored: false`, returns no sample; with `True` returns a sample doc carrying rows + error body + `expires_at` ≈ +30 d
- [x] 1.2 API: default Check → run has no `newest_record`, has `newest_hash`, `GET /api/runs/{id}` has no `sample`, `error_details` null on a 404 destination
- [x] 1.3 API: `store_samples: true` → `sample.newest_record`, `sample.newest_window`, `sample.expires_at`; a `run_samples` document exists
- [x] 1.4 API: `DELETE /api/auth/me` → 401 afterwards, Checks gone, samples gone
- [x] 1.5 Index: `run_samples` has a TTL index on `expires_at`

## 2. Backend

- [x] 2.1 `store_samples` on `CheckCreate`/`CheckUpdate`, stored + sanitised
- [x] 2.2 `_canonical_hash`, `_split_sample`; `execute_check` writes the redacted fingerprint and inserts the sample doc when opted in; `error_details` only inside the sample
- [x] 2.3 `run_samples` collection + TTL index at startup; `GET /api/runs/{id}` attaches `sample`; Check delete and account delete purge samples
- [x] 2.4 `DELETE /api/auth/me`

## 3. Frontend

- [x] 3.1 Expectations editor: "Store raw samples for 30 days" checkbox; row in the display list
- [x] 3.2 Run panel: fingerprint block shows the hash; "Sample" block from `sample` when present, otherwise one line explaining how to enable
- [x] 3.3 Nav: "Delete account" with confirm

## 4. Verify locally, then push

- [x] 4.1 Full suite green (count pasted from pytest)
- [x] 4.2 Production build compiles; editor toggle and run panel checked in Edge
- [x] 4.3 `docs/what-we-store.md` rewritten to match; PRD updated; commit; push
