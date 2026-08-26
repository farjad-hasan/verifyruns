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
