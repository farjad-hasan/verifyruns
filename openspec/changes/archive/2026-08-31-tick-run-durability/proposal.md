## Why

A queued verification run can vanish without a trace. `drainPendingRuns` clears the whole queue (`pending_runs = '[]'`) *before* executing the items; if the invocation dies mid-drain — subrequest cap, CPU limit, eviction — every unexecuted item is gone from D1 forever, and `tickSafely` swallows the error. The webhook-wait spec promises "all ten runs exist after the next tick"; that holds only when nothing interrupts the loop. Separately, every one of the tick's three sweeps is unbounded and two of them are full table scans of `checks` (no index on `pending_runs` / `pending_retry`), plus two queries per heartbeat Check per minute — the same defect class as the >100-bind-parameter 500 fixed in `f8b9515`, and the first thing that breaks as tenants grow.

Production-readiness review 2026-08-31: CRITICAL #1 (backend), HIGH #4, MEDIUM #19.

## What Changes

- Queued runs are drained item-durably: claim a bounded batch, execute, and re-append any unexecuted remainder with `json_insert` if the loop aborts; a `try/finally` guarantees the re-append. Nothing is deleted until it has run or been requeued.
- Every sweep gets a `LIMIT` (`VR_TICK_BATCH`, default 25 per sweep); leftover work waits for the next minute instead of blowing the invocation budget.
- Partial indexes on `checks(pending_runs)` and `checks(pending_retry)` (WHERE non-empty), and a `next_heartbeat_due_at` column so the heartbeat sweep is one indexed range scan instead of N+1 per-Check queries.
- The tick stamps `tick_last_ok_at` on successful completion, distinct from the existing start stamp (`production-ops` exposes it via `/api/health`).
- `VR_LAZY_TICK_SECONDS` default raised so the cron carries the cadence and traffic stops issuing a D1 UPDATE per request.

## Capabilities

### Modified Capabilities
- `webhook-wait`: queued-mode drain cannot lose runs.
- `heartbeat`: tick work is bounded, indexed, and records completion.

## Impact

`worker/src/tick.ts`, `worker/src/env.ts`, `worker/migrations/0003_tick_bounds.sql`, `worker/test/tick*.test.ts`, `docs/deploy.md` limits section (add D1 rows-read quota).
