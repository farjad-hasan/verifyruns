## Why

`check_runs` grows forever. The UI shows 30 runs and the pricing page sells "30-run / 90-day history", but nothing ever deletes a run row — retention is a display illusion. A single Check webhooked every 5 minutes writes ~105k rows a year; the dashboard windows over this table on every load, so unbounded growth burns D1's daily row-read quota (the real free-tier ceiling) long before its storage cap. `deleteMe` has the same unbounded shape on the other end: it builds two statements per Check into one `DB.batch`, so an account with many Checks exceeds the batch limit and the one operation that must never fail, fails.

Production-readiness review 2026-08-31: CRITICAL #2 (ops) / HIGH #7, MEDIUM #18 (backend).

## What Changes

- A retention sweep joins the tick: delete `check_runs` older than `VR_RUN_RETENTION_DAYS` (default 90) while always keeping the newest `VR_RUN_RETENTION_MIN` (default 35) per Check, so the 30-run baseline window can never be starved. Deletes are batched (`LIMIT` per tick) like every other sweep.
- Per-plan windows (Free 30 runs / Pro 90 days) stay deferred to `pricing-tiers`; until billing exists, everyone gets the 90-day/35-floor rule and the pricing page's history bullets gain "after launch" wording so the page does not promise enforcement that predates it.
- `deleteMe` chunks its statements (same 90-per-batch discipline as `listChecks` after `f8b9515`) so accounts of any size delete completely.
- `docs/what-we-store.md` states run-row retention explicitly, and notes that sample expiry depends on the tick running.

## Capabilities

### Modified Capabilities
- `data-retention`: run rows are bounded; account deletion works at any size.

## Impact

`worker/src/tick.ts` (sweep), `worker/src/env.ts`, `worker/src/routes.ts` (`deleteMe` chunking), `worker/test/retention.test.ts`, `frontend/src/pages/Pricing.jsx` copy, `docs/what-we-store.md`, `docs/deploy.md` limits note.
