## 1. Tests first (worker/test/)

- [x] 1.1 drain: kill execution after item 2 of 5 (throwing fetch stub) → 3 items still in `pending_runs`, run again → all 5 runs exist
- [x] 1.2 drain: simulate eviction between execute and remove (execute, skip the remove) → next tick re-runs that item; duplicate run exists, none missing
- [x] 1.3 drain: predicated per-item remove is safe against a concurrent `json_insert` append (appended item survives)
- [x] 1.4 drain: queue of `VR_TICK_BATCH + 3` → batch executes this tick, tail drains next tick
- [x] 1.5 heartbeat: due Check selected via `next_heartbeat_due_at`; run insert and `heartbeat_hours` PATCH both maintain the column; duplicate guard still holds under two concurrent ticks
- [x] 1.6 `tick_last_ok_at` stamped on success, not on a throwing tick
- [x] 1.7 migration 0003 applies over 0001+0002 in the workerd migration harness; backfill populates `next_heartbeat_due_at`

## 2. Migration + worker

- [x] 2.1 `migrations/0003_tick_bounds.sql`: `next_heartbeat_due_at` column + backfill, partial indexes on `pending_runs`/`pending_retry`/`next_heartbeat_due_at`
- [x] 2.2 `tick.ts`: batch limits (`VR_TICK_BATCH` in `env.ts`), remove-after-execute drain (predicated per-item removal, at-least-once), single-scan heartbeat sweep, `tick_last_ok_at` stamp
- [x] 2.3 maintain `next_heartbeat_due_at` in `execute.ts` (run insert) and `checks.ts` (heartbeat PATCH)
- [x] 2.4 `VR_LAZY_TICK_SECONDS` default 300; keep 0-disables behaviour

## 3. Docs

- [x] 3.1 `docs/deploy.md` limits section: add D1 daily rows-read/rows-written quotas and what the indexes buy
- [x] 3.2 `docs/self-hosting.md`: lazy-tick default change and the env table row

## 4. Verify locally, then push

- [x] 4.1 Full suite green; typecheck clean; `npm run migrate:remote` rehearsed on a local D1 copy first
- [ ] 4.2 Live: `wrangler tail` one cron tick — confirm query count is flat with 1 vs many idle checks
- [ ] 4.3 Commit; push; update `memory/PRD.md`
