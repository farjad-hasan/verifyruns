## 1. Tests first (worker/test/)

- [x] 1.1 `schedule.test.ts`: `nextHeartbeatDue` pure cases — no window equals `+N h`; overnight gap (22:30 → 14:00 next day); miss inside window (13:00 run, 1 h → 14:00); Mon–Fri weekend skip (Fri 16:00, 2 h → Mon 10:00); wrapping 22:00–06:00; anchor outside window (run at 03:00, window 09–17 → 09:00 + N); DST boundary in `Europe/London` (walk stays on wall-clock hours)
- [x] 1.2 `checks.test.ts`: create/patch validation scenarios from the spec (window without cadence → 400 `heartbeat_hours`; bad tz → 400 `heartbeat_window.tz`; bad `days`; clearing cadence clears window); field round-trips on detail and list
- [x] 1.3 `tick.test.ts`: windowed Check does not fire during its closed hours (tick at 03:00 local with last run 22:30) and does fire after 14:00; message carries the "(active …)" suffix
- [x] 1.4 migration 0005 applies over 0001–0004 in the harness (`apply-migrations.ts` picks it up)

## 2. Worker

- [x] 2.1 `migrations/0005_heartbeat_window.sql`: `ALTER TABLE checks ADD COLUMN heartbeat_window TEXT` (JSON, nullable, no backfill — null is the flat rule)
- [x] 2.2 `schedule.ts`: `HeartbeatWindow` type, `nextHeartbeatDue(anchor, hours, window)` walking open periods in `tz` via `Intl.DateTimeFormat` parts (bounded to 60 days, then falls back to flat arithmetic), `describeWindow` for the message
- [x] 2.3 `validate.ts`: `parseHeartbeatWindow`; `checks.ts`: column on `CheckDoc`/`rowToCheck`/insert, `recomputeHeartbeatDue` reads anchor rows and calls `nextHeartbeatDue` (drop the strftime expression); `execute.ts` and `tick.ts` call the same function; `tick.ts` message suffix
- [x] 2.4 `routes.ts`: accept on create/patch (window requires cadence, cadence-null clears window), include on reads

## 3. Frontend

- [x] 3.1 `HeartbeatField`: "Only during…" disclosure — start, end, timezone select (default `Intl.DateTimeFormat().resolvedOptions().timeZone`, common zones + free text), "Weekdays only" checkbox → `days: [1,2,3,4,5]`; hidden/cleared when hours is blank; every control carries a `data-testid`
- [x] 3.2 `NewCheck.jsx` and `CheckDetail.jsx` edit form send `heartbeat_window`; detail Heartbeat row reads "expect a run every 1 h, 13:00–23:00 Asia/Karachi, weekdays"
- [x] 3.3 `DESIGN.md` unchanged (no new tokens); confirm the disclosure uses existing form classes only

## 4. Docs

- [x] 4.1 `README.md` heartbeat sentence gains the window clause; `docs/n8n.md`, `docs/make.md`, `docs/zapier.md` never introduce the heartbeat, so nothing to add there

## 5. Verify locally, then push

- [x] 5.1 `cd worker && npm test && npm run typecheck` green (186 passed, 5 skipped); `cd frontend && CI=true yarn build` clean — **form not yet checked in Edge on `:3100`** (left for the merge pass)
- [ ] 5.2 Blind review of the diff (`blind-reviewer` agent, test command supplied) before merge
- [ ] 5.3 Merge to `main` (deploys: migration before code per `docs/deploy.md`); set the dogfood fleet's hourly-sweep Check to window 13:00–23:00 Asia/Karachi once the `dogfood-fleet` change has created it; flip the claim to done; remove the worktree

## 6. Blind review fixes

- [x] 6.1 HIGH — flat fallback reachable for long cadences: `WALK_CAP_DAYS` 60 → 400; `validateHeartbeatCapacity` refuses on create/patch (effective pair) with 422 naming `heartbeat_window`; tests for 400 h Mon–Fri, 100 h over 1 h/day, 720 h max; spec deltas updated
- [x] 6.2 MEDIUM — spring-forward gap: `fromWallClockMs` resolves non-existent wall times to the transition instant (monotone), walk clamps `avail`/`t`; tests for Europe/London 2026-03-29 and America/New_York 2026-03-08, straddling and inside the gap
- [x] 6.3 MEDIUM — CheckDetail save dropped a non-weekday `days` list: form state carries `days` verbatim, the checkbox only replaces it when toggled, a custom set shows as read-only text (`*-heartbeat-window-days`)
- [x] 6.4 LOW — `recomputeHeartbeatDue` is compare-and-set with retry (predicated on the due it read), so a run landing mid-recompute keeps its own due while a shortened cadence can still pull the due earlier; race test in `tick.test.ts`
- [x] 6.5 HIGH (re-review) — capacity bound ignored DST-collapsed days: `activeMinutesWithinCap` now subtracts two springs × min(open, 60 min); tests assert London 01:00–02:00 daily rejects 399 h and walks 397 h, Sunday-only rejects 56/57 h and walks 55 h, New York 02:00–03:00 rejects 399 h; cap comment restated as the exact invariant
- [x] 6.6 LOW (re-review) — `recomputeHeartbeatDue` warns with the check id after exhausting 5 CAS attempts
- [x] 6.7 LOW (re-review) — walk-cap timing claim replaced with the measured figures (3.5 ms full walk, 0.85 ms 720 h weekday, 0.03 ms hourly)
