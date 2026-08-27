## Context

`webhook()` discards the request body and `execute_check(check_id, trigger, run_id)` has no channel for per-run input. `_compute_verdict` only knows `expectations`. The change threads one optional integer from the HTTP body to the verdict.

## Goals / Non-Goals

**Goals:**
- Zero-config compatibility: Checks without a body behave exactly as today.
- One integer is all a workflow must add; no schema, no signing.
- Steady-state tables (lookup tables, config rows) become watchable.

**Non-Goals:**
- Verifying *which* rows were written (row-level reconciliation by id) — later.
- Authenticating the body beyond the secret URL.

## Decisions

- **Body is optional, integer-only, tolerant.** Accept `wrote`, `expected_new`, `count`; ignore anything else; non-integer → treated as absent and noted in the run ("webhook body ignored: not an integer"). Alternative: strict schema with 400s — hostile to no-code tools that send whatever the previous node emitted.
- **`claimed` overrides `min_new_records` for that run only.** Persisted on the run as `claimed_new` so history explains itself.
- **`growth_mode` lives in `expectations`** (not a top-level field) so the existing inline editor and PATCH path carry it unchanged.
- **Retry runs reuse the original run's `claimed_new`** — the retry is re-checking the same workflow run.

## Risks / Trade-offs

- [Workflow sends cumulative totals instead of per-run counts] → message shows both numbers so the mismatch is obvious; docs snippet uses per-run item count.
- [Two webhooks in flight race on the same baseline] → unchanged from today; noted for the scheduling change later.
