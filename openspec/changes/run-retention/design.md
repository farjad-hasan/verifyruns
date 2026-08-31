## Context

Only `run_samples` and `password_resets` expire today. `check_runs` is indexed by `(check_id, timestamp)` (`runs_check_ts`), which the sweep can use. The verdict baseline needs up to 30 PASS runs; deleting by age alone could starve a quiet Check's baseline.

## Goals / Non-Goals

**Goals:**
- Bounded table growth without ever weakening a verdict.
- Deletion cost bounded per tick.
- Truthful retention claims on `/pricing` and in `docs/what-we-store.md`.

**Non-Goals:**
- Per-plan enforcement — lands with billing in `pricing-tiers`.
- Archival/export of old runs; deleted means deleted, as the docs already promise for samples.

## Decisions

- **Age AND floor.** Delete only rows that are both older than `VR_RUN_RETENTION_DAYS` *and* beyond the newest `VR_RUN_RETENTION_MIN` per Check. Floor of 35 > the 30-run baseline window plus display, so `_compute_verdict` and the timeline never notice. Implemented as a per-Check subquery over `runs_check_ts`, batched by the tick's `LIMIT` discipline.
- **Sweep scope per tick**: process a rotating slice of Checks (`ORDER BY id` cursor in `meta.retention_cursor`) rather than scanning all rows each minute; a full rotation every few hours is ample for a 90-day window.
- **`deleteMe` chunks at 90 statements per batch**, sequentially; the user row is deleted in the final batch so a partial failure leaves a retryable account, never a half-deleted orphan with no owner.
- **Pricing copy**: history bullets read "30 runs (after launch — 90 days for everyone in early access)" style; no UI implies enforcement that is not live, per the product principle of honest state.

## Risks / Trade-offs

- [A Check whose last PASS is older than 90 days loses baseline] → the 35-newest floor keeps those rows regardless of age.
- [Rotating cursor delays deletion for some Checks by hours] → irrelevant at a 90-day horizon.
