## Context

`tick.ts` runs three sweeps per minute: heartbeats (`SELECT *` on all heartbeat Checks + 2 queries each), retry drain (`pending_retry IS NOT NULL`, unindexed), queue drain (`pending_runs != '[]'`, unindexed, claim-all-then-execute). D1 has no cross-statement transactions, so durability has to come from claim shapes, not rollbacks.

## Goals / Non-Goals

**Goals:**
- No queued run is ever silently dropped; worst case it runs a minute late.
- Tick cost proportional to *due work*, not to total tenants.
- A dead-but-stamping tick is distinguishable from a completing one.

**Non-Goals:**
- A real queue (Cloudflare Queues) — right shape eventually, not while the free tier is the constraint.
- Multi-item parallel execution inside the tick.

## Decisions

- **Remove-after-execute, not claim-then-execute.** The swap-to-`[]` shape is the bug: once swapped, unexecuted items live only in memory, and `try/finally` does not survive a hard eviction. Instead the drain reads the queue, executes the head item, then removes exactly that item with a predicated `json_remove`-style UPDATE (concurrency-safe against `json_insert` appends), and repeats up to `VR_TICK_BATCH`. An eviction between execute and remove re-runs one item next tick — at-least-once, same philosophy as alert delivery: a duplicate run is recoverable, a lost one is not.
- **`next_heartbeat_due_at` is maintained, not computed.** Set on run insert (any trigger) and on `heartbeat_hours` change; the sweep is `WHERE next_heartbeat_due_at <= now LIMIT ?` on a partial index. The in-statement NOT EXISTS guard stays as the correctness backstop.
- **Partial indexes** (`WHERE pending_runs != '[]'`, `WHERE pending_retry IS NOT NULL`) keep the scans O(due). Migration `0003` backfills `next_heartbeat_due_at` from the latest run per Check.
- **`tick_last_ok_at`** stamped as the final statement of a successful tick; `tick_last_at` (start) keeps its role for the lazy-tick claim window.
- **Lazy tick default to 300 s.** The cron covers the minute cadence in production; the lazy tick remains the fallback for self-hosters without cron. Self-hosting docs updated.

## Risks / Trade-offs

- [LIMIT delays heartbeat FAILs by up to a few minutes under backlog] → acceptable; heartbeat windows are hours.
- [Backfill migration touches every Check row] → single UPDATE with a subquery, run once; tested against the migration suite in workerd.
- [Requeue-the-tail-first costs one extra UPDATE per drained Check] → cheap next to the destination fetch it protects.
