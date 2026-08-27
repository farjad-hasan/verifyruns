## Context

Every run today is caused by a webhook, a manual click, or a retry. Nothing runs when nothing calls, so a workflow that stopped firing looks exactly like a workflow that was never configured: a grey timeline, no alert. Cronitor/Healthchecks own this half of the problem ("did it run at all?"); VerifyRuns must own both halves to be a complete watchdog.

Development is local (no Emergent cron); the API is a single uvicorn process with FastAPI background tasks.

## Goals / Non-Goals

**Goals:**
- Per-Check "expect a run every N hours"; a missed window produces a FAIL run with its own trigger and message, routed through the existing alert semantics (dedup, snooze, recovery on the next real PASS).
- At most one heartbeat FAIL per missed window; a dead workflow keeps producing one per window so the timeline shows the outage, but alerts fire once (state-based dedup already guarantees that).
- Zero new infrastructure: an in-process ticker.

**Non-Goals:**
- Cron-expression schedules ("every weekday at 9") — hours are enough for v1.
- Scheduled *re-checks* of the destination (that is a different feature: polling).
- A durable job queue; noted for the hosting move.

## Decisions

- **`heartbeat_hours` lives on the Check (not in expectations).** Expectations describe the destination; the heartbeat describes the workflow's cadence. Integer hours, 1–720, `null` = off.
- **Anchor = last non-heartbeat run, else `created_at`.** A heartbeat FAIL must not reset the clock, or a dead workflow would alert once and then look "recently run". Fire when `now − anchor > heartbeat_hours` **and** `now − last heartbeat run > heartbeat_hours` (or none exists). Both conditions are pure and unit-tested (`_heartbeat_due`).
- **In-process ticker.** `asyncio` task started on app startup, ticking every `VR_HEARTBEAT_TICK_SECONDS` (default 60). Each tick calls `_heartbeat_tick(now)` which is separately callable with an injected `now`, so the API-level test can drive it without waiting an hour. Alternative considered: platform cron — not available locally and would need a second entry point.
- **Heartbeat runs skip retry-before-alert.** There is nothing to re-fetch; the run goes straight to `_maybe_alert` (snooze still respected).
- **Message:** "No run in 26 h — expected one every 24 h." Elapsed hours rounded to the nearest integer.
- **Fingerprint:** empty (`record_count 0`, no fields). Heartbeat runs are FAILs and never enter the PASS baseline, so they cannot distort later diffs.

## Risks / Trade-offs

- [Ticker dies silently] → wrapped in try/except with logging; the loop never exits on an error. A future `/api/health` can report last tick time.
- [Two API processes both tick] → duplicate heartbeat runs within the same minute. Acceptable at this scale; the Mongo unique index on `(check_id, trigger, window_start)` is the fix when it matters — noted, not built.
- [Clock skew between anchor and now] → all timestamps are UTC ISO strings written by this process.
- [User sets 1 h on a daily workflow] → the UI copy says "a little longer than your workflow's longest normal gap".

## Migration Plan

No migration: existing Checks have no `heartbeat_hours` and are ignored by the ticker. Deploy = restart.

## Open Questions

- Should a missed heartbeat also appear on the public status page as its own state ("silent")? Left as a FAIL for now.
