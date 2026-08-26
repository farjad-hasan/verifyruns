## Context

`_fetch_records` returns a flat list of dict records; `_fingerprint` derives everything from that list, including `record_count = len(records)`. Both Airtable and Postgres branches truncate the list at 100 before it reaches the fingerprint, so the count and the sample are the same object. The fix separates "how many rows exist" from "which rows we look at".

## Goals / Non-Goals

**Goals:**
- `record_count` is the true number of rows the query/view exposes, for all three connectors.
- Sample-based metrics (fields, null_pct, newest_record) keep working on a bounded sample so a 1M-row table cannot stall the worker.
- Existing Checks need no reconfiguration.

**Non-Goals:**
- Choosing which rows form the sample (see `deterministic-newest-record`).
- Streaming or incremental fingerprints.
- Airtable filterByFormula / Postgres WHERE-window support.

## Decisions

- **Return `(records, total)` from `_fetch_records`, not a bigger list.** Alternative: page everything into memory and `len()` it — simple but unbounded for Postgres. Returning a separate total keeps memory bounded and lets HTTP/JSON keep `total = len(records)`.
- **Airtable: page with `offset`, cap at `VR_AIRTABLE_MAX_RECORDS` (default 10,000).** Airtable has no count endpoint, so paging is the only way; the cap protects against runaway bases and is reported in the diff when hit ("count capped at 10,000").
- **Postgres: two statements in one read-only session** — `SELECT COUNT(*) FROM (<q>) AS _vr` then `SELECT * FROM (<q>) AS _vr LIMIT 100`. Alternative: window function `COUNT(*) OVER()` in one query — fewer round-trips but breaks on queries that already use aggregates. Two statements is robust and the guard already forbids semicolons in `q`.
- **Fingerprint adds `sample_size`.** Shown in the run panel as "N records (M sampled)" when they differ. Old runs without the field render as before.

## Risks / Trade-offs

- [First post-deploy run shows a large positive delta against a capped baseline] → PASS; message says "Destination gained N record(s)" — no false FAIL, one odd-looking bar.
- [Airtable rate limit (5 req/s/base) on big bases] → sequential paging with the httpx client; 10,000 rows = 100 requests ≈ 20 s, inside the 20 s timeout only if raised per-page; set per-request timeout 20 s, overall budget 60 s.
- [COUNT(*) on a heavy query is slow] → 15 s statement timeout via `SET statement_timeout`; on timeout fall back to sample length and mark `count_estimated: true`.
