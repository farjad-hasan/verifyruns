## Why

A workflow that runs hourly during business hours cannot be watched today. The heartbeat rule is a flat "expect a run every N hours", so an hourly 09:00–17:00 sync must be set to N ≥ 17 to survive the overnight gap — and at that setting a missed 10:00 run is not noticed until the next morning. Agencies run client syncs on exactly this shape (hourly in office hours, weekdays only), and the dogfood fleet has one too (hourly 13:00–23:00). Cronitor and Healthchecks.io both offer schedule-aware expectations for this reason; a flat interval is the one heartbeat gap a prospect will hit in the first ten minutes.

## What Changes

- A Check with `heartbeat_hours` may also carry `heartbeat_window`: `{start: "HH:MM", end: "HH:MM", tz: "<IANA zone>", days?: [0..6]}`. Null (default) keeps today's behaviour exactly.
- Inside a window, the rule is unchanged. Outside it, the clock stops: the next due time is "N *active* hours after the last run", computed by walking forward through open periods. A 16:00 Friday run with a 2 h cadence and a Mon–Fri 09:00–17:00 window is due Monday 10:00, not Friday 18:00.
- The heartbeat message names the window when one is set: "No run in 17 h — expected one every 1 h (active 13:00–23:00 Asia/Karachi)."
- `next_heartbeat_due_at` stays the single scheduling column; the walk replaces the `+N hours` arithmetic at its three write sites (Check insert, run insert, heartbeat fire) and the SQL recompute on PATCH moves into the Worker so all four agree.
- Create/edit forms get an "Only during…" disclosure under the heartbeat field: start, end, timezone (defaults to the browser's), weekdays-only toggle. The detail page's Heartbeat row states the window.
- Deliberately **not** a cron expression or a DSL: one daily window, optional day set. Multiple windows per day, holidays and per-day hours are out of scope until a user asks.

## Capabilities

### Modified Capabilities
- `heartbeat`: missed-heartbeat rule becomes window-aware; message wording extended.
- `checks`: create/update accept and validate `heartbeat_window`; the field is returned on read.

## Impact

- `worker/migrations/0005_heartbeat_window.sql` (nullable TEXT column, no backfill)
- `worker/src/validate.ts` (`parseHeartbeatWindow`), `worker/src/schedule.ts` (new: pure `nextHeartbeatDue`, timezone helpers), `worker/src/checks.ts` (`CheckDoc`, insert, `recomputeHeartbeatDue`), `worker/src/execute.ts` (run insert re-anchor), `worker/src/tick.ts` (fire + message), `worker/src/routes.ts` (create/patch/read)
- `worker/test/schedule.test.ts` (new), `worker/test/tick.test.ts`, `worker/test/checks.test.ts`
- `frontend/src/components/ExpectationsFields.jsx` (`HeartbeatField`), `frontend/src/pages/NewCheck.jsx`, `frontend/src/pages/CheckDetail.jsx`
- `README.md` heartbeat line, `docs/n8n.md` / `docs/make.md` / `docs/zapier.md` heartbeat mentions if any
- Not touched: `PublicStatus.jsx` (owned by the open `public-page-shell` change); the public page keeps showing the verdict only.
