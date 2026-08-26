## Why

A Check only runs when the workflow pings it. A workflow that never started, or crashed before its final node, produces no run and therefore no alert — silence is invisible. The n8n thread the wedge was picked from asks for both halves ("ran but did nothing" and "didn't run"), and Cronitor/Healthchecks own the second half today. Adding "expect a ping every N hours" makes VerifyRuns a complete watchdog instead of half of one.

**Activation trigger:** first external user with a live Check, or ≥10 sign-ups — whichever comes first. Before that it competes with contest-week polish for credits.

## What Changes

- Per-Check `heartbeat_hours` (optional). A scheduler evaluates every minute: if `now − last run timestamp > heartbeat_hours` and no missed-heartbeat run exists since, insert a synthetic FAIL run with `trigger="heartbeat"` and message "No run in 26 h — expected one every 24 h."
- Alerts treat a missed heartbeat like any FAIL (dedup, snooze, recovery on the next real run).
- Dashboard row shows a clock badge with the expected interval.
- Scheduler runs in-process (`asyncio` loop on startup) on Emergent; swaps to a cron/worker once off-platform.

## Capabilities

### New Capabilities
- `heartbeat`: expected-cadence monitoring and synthetic missed-run verdicts.

### Modified Capabilities
- `alerts`: missed heartbeat is an alertable FAIL and a real run recovers it.
- `checks`: `heartbeat_hours` field; `trigger` gains `heartbeat`.

## Impact

`server.py` startup loop, Check model, `_maybe_alert`; Dashboard/CheckDetail badges; confirm whether Emergent's pod cron is usable by the app (unverified) — otherwise the in-process loop is the only option there.
