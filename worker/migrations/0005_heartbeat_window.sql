-- Heartbeat active window (heartbeat-schedule-window). JSON {start, end, tz, days?} or NULL.
-- NULL keeps the flat "+heartbeat_hours" rule; no backfill needed. next_heartbeat_due_at is
-- recomputed in the Worker (schedule.ts) whenever heartbeat_hours or this column changes.
ALTER TABLE checks ADD COLUMN heartbeat_window TEXT;
