## 1. Tests first

- [x] 1.1 Pure: `_heartbeat_due(heartbeat_hours, anchor_ts, last_heartbeat_ts, now)` — not due inside the window; due after it; not due again until another window has passed since the last heartbeat run; anchor falls back to `created_at`
- [x] 1.2 Pure: `_heartbeat_message(elapsed_hours, heartbeat_hours)` wording
- [x] 1.3 API: create a Check with `heartbeat_hours`, drive `_heartbeat_tick(now=+2h)` in-process → one heartbeat FAIL run; tick again at the same `now` → still one; webhook PASS afterwards → PASS run and the heartbeat clock re-anchors
- [x] 1.4 API: `heartbeat_hours` validation (422 on 0 / 1000), PATCH to null clears

## 2. Backend

- [x] 2.1 `CheckCreate.heartbeat_hours` / `CheckUpdate.heartbeat_hours` (Optional[int], 1–720); stored and sanitised on the Check
- [x] 2.2 `_heartbeat_due`, `_heartbeat_message`, `_heartbeat_tick(now)`; heartbeat run doc with `trigger="heartbeat"`, empty fingerprint, straight to `_maybe_alert` (snooze respected)
- [x] 2.3 Startup ticker task every `VR_HEARTBEAT_TICK_SECONDS` (60), never exits on error; cancelled on shutdown

## 3. Frontend

- [x] 3.1 NewCheck: "Expect a run every N hours" field with helper copy
- [x] 3.2 CheckDetail: heartbeat row + editable in the Expectations card; run panel shows trigger `heartbeat`
- [x] 3.3 Dashboard row: clock badge "every 24 h" when set

## 4. Verify locally, then push

- [x] 4.1 Full suite green (count pasted from pytest)
- [x] 4.2 Production build compiles; field and badge checked in Edge
- [x] 4.3 Ticker observed firing in the backend log with a 1-hour Check and a short `VR_HEARTBEAT_TICK_SECONDS`
- [x] 4.4 Commit; push; PRD + docs updated
