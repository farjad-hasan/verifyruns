## Context

Depends on `fix-record-cap-paging` (sample vs total). Ordering is applied to the sample only.

## Goals / Non-Goals

**Goals:** a defined, documented notion of "newest" per connector; non-empty rule robust to one outlier.
**Non-Goals:** full-table scans for the newest row; inferring timestamp fields automatically.

## Decisions

- **Airtable sorts client-side by `createdTime`** rather than adding `sort[]` params — works with any view and needs no extra config.
- **Postgres: detect `ORDER BY` with a regex on the guarded query; do not inject one.** Injecting would guess a column; skipping the rule with a message is honest.
- **Window of 5** for the non-empty rule: FAIL only if the field is empty in the newest record AND in the majority of the window, unless the window has one record.

## Risks / Trade-offs

- [Users read "rule skipped" as a bug] → message is explicit and links to the docs snippet.

## Implementation notes (2026-08-27)

- Connectors hand the sample over **newest-first**; `_fingerprint` takes `records[0]` as newest and `records[:5]` as `newest_window`. Airtable sorts by `createdTime`; HTTP/JSON sorts by `config.newest_key` when set, else reverses the endpoint's array so the documented "last element" default still holds; Postgres sets `newest_defined = _has_order_by(query)` (regex `\border\s+by\b`) and never injects an ORDER BY.
- Window rule: FAIL only when the newest record is empty **and** more than half the window is; a single-record window falls back to "empty in the newest record".
- The skip note is appended to the run message (PASS or FAIL) only when `non_empty_fields` is configured.
