## 1. Tests first

- [x] 1.1 Lazy tick: with `meta.tick.last_at` set 2 min back, one API request advances it and runs the tick; a second immediate request does not tick again
- [x] 1.2 Queued webhook: `?wait=0` → 202 `{queued: true, run_id}`, no run yet; `_tick()` → one run with that id, `trigger="webhook"`; a second `_tick()` adds nothing
- [x] 1.3 Airtable: mock paged API asserts pages ≥2 carry `fields[]`; count 250; newest on page three is fetched by id and heads the sample; page one only → no extra fetch
- [x] 1.4 Existing Airtable tests keep passing (ceiling, single page)

## 2. Backend

- [x] 2.1 `meta` tick document at startup; `_claim_lazy_tick(now)`; HTTP middleware schedules `_tick()` as a task after the response when claimed; cron endpoint and internal loop stamp `last_at`
- [x] 2.2 `pending_runs` on the Check; `?wait=0` → 202; `_drain_pending_runs(now, database)` inside `_tick` (atomic swap)
- [x] 2.3 Airtable branch: full page one, `fields[]` on later pages, newest-by-`createdTime` across pages with single-record fetch

## 3. Cloudflare Worker + docs

- [x] 3.1 `deploy/cloudflare-tick-worker/wrangler.toml` + `src/index.js` (scheduled handler) + README
- [x] 3.2 `docs/deploy.md` step 4 → Worker cron every minute (cron-job.org fallback); note the keep-awake effect and the `?wait=0` option; `docs/self-hosting.md` env table (`VR_LAZY_TICK_SECONDS`); `docs/n8n.md` mentions `?wait=0`

## 4. Verify locally, then push

- [x] 4.1 Full suite green (count pasted from pytest)
- [x] 4.2 Commit; push; PRD updated
