## 1. Tests first (worker/test/retention.test.ts)

- [x] 1.1 sweep deletes rows older than the window beyond the floor; keeps the newest 35 regardless of age
- [x] 1.2 verdict after a sweep on an old quiet Check still finds its 30-PASS baseline
- [x] 1.3 rotating cursor covers all Checks across successive ticks; batch LIMIT respected
- [x] 1.4 `deleteMe` with 300 seeded Checks succeeds; user row goes last; a mid-way failure leaves the account loginable and retryable

## 2. Worker

- [x] 2.1 `env.ts`: `VR_RUN_RETENTION_DAYS` (90), `VR_RUN_RETENTION_MIN` (35)
- [x] 2.2 `tick.ts`: retention sweep with `meta.retention_cursor`, batched deletes over `runs_check_ts`
- [x] 2.3 `routes.ts` `deleteMe`: chunk at 90 statements/batch, sequential batches, user row in the final batch

## 3. Frontend + docs

- [x] 3.1 `Pricing.jsx`: history bullets say what is enforced today vs planned
- [x] 3.2 `docs/what-we-store.md`: run-row retention section; "expiry depends on the tick" clause for samples
- [x] 3.3 `docs/deploy.md`: limits section notes rows-read cost of the sweep and what the cursor bounds it to

## 4. Verify locally, then push

- [x] 4.1 Full suite green; typecheck clean
- [ ] 4.2 Live after one rotation: `SELECT COUNT(*)` on a seeded old Check shows the floor; dashboard and timeline unchanged
- [ ] 4.3 Commit; push; update `memory/PRD.md`
