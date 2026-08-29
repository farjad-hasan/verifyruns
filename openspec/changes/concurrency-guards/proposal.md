## Why

The 2026-08-29 production-readiness review found three read-modify-write windows in the tick and alert paths. Each is harmless with one caller and wrong with two — and there are always at least two callers: the cron tick and the lazy tick on traffic (plus `POST /api/internal/tick`). `drainRetries` and `drainPendingRuns` already claim their work with a conditional UPDATE; these three paths do not.

1. `heartbeatTick` reads the last heartbeat, decides "due", and inserts. Two ticks in the same second both insert and both alert.
2. `POST /api/hook/{secret}?wait=0` reads `pending_runs`, appends in JS, writes the whole array back. Two webhooks in the same second lose one of the queued runs — a run that was acknowledged with 202 never executes.
3. `maybeAlert` reads `last_alerted_verdict`, delivers, then writes. Two runs finishing together (a webhook and a retry, or a heartbeat and a webhook) both see the old value and both deliver.

## What Changes

- `heartbeatTick` inserts the heartbeat row with `INSERT … SELECT … WHERE NOT EXISTS (a heartbeat within the window)`, a single statement; only the caller whose insert landed counts it and routes the alert.
- `?wait=0` appends with `json_insert(pending_runs, '$[#]', json(?))` in one UPDATE — no read. A concurrent drain that swaps `pending_runs` by string comparison sees a mismatch and leaves the item for the next tick (deferred, not lost).
- `maybeAlert` claims the transition with a predicated UPDATE (`… WHERE last_alerted_verdict IS NOT 'FAIL'` for FAIL, `… WHERE last_alerted_verdict = 'FAIL'` for PASS) *before* delivering; a caller whose claim changes no row returns without delivering. This moves the persist from "after the delivery attempt" to "before" — the only behavioural difference is that a Worker that dies mid-delivery loses the alert instead of duplicating it on the next FAIL, which is the right side to err on for a transition alert.
- `RateLimiter` drops empty keys when pruning, so the hook limiter (keyed by attacker-chosen secrets) stops growing without bound inside one isolate.

## Capabilities

### Modified Capabilities
- `heartbeat`: at most one heartbeat run per window even with concurrent ticks.
- `webhook-wait`: queued-mode enqueue is atomic.
- `alerts`: transition claim precedes delivery; concurrent runs cannot double-alert.

## Impact

`worker/src/tick.ts`, `worker/src/routes.ts` (enqueue), `worker/src/checks.ts` (new `enqueueRun`), `worker/src/alerts.ts`, `worker/src/egress.ts`; new `worker/test/concurrency.test.ts`. No migration, no API change.
