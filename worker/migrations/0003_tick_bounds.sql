-- Tick cost proportional to due work, not tenant count (tick-run-durability).
-- next_heartbeat_due_at is maintained (run inserts, heartbeat fires, heartbeat_hours changes);
-- the in-statement NOT EXISTS guard on heartbeat inserts stays as the correctness backstop.
ALTER TABLE checks ADD COLUMN next_heartbeat_due_at TEXT;

-- Backfill: due one window after the latest real run (or created_at), and never earlier than one
-- window after the last heartbeat that already fired. MAX() on ISO-8601 strings is chronological.
UPDATE checks SET next_heartbeat_due_at = strftime(
  '%Y-%m-%dT%H:%M:%fZ',
  MAX(
    COALESCE((SELECT MAX(timestamp) FROM check_runs WHERE check_id = checks.id AND "trigger" != 'heartbeat'), created_at),
    COALESCE((SELECT MAX(COALESCE(heartbeat_at, timestamp)) FROM check_runs WHERE check_id = checks.id AND "trigger" = 'heartbeat'), '')
  ),
  '+' || heartbeat_hours || ' hours'
)
WHERE heartbeat_hours IS NOT NULL AND heartbeat_hours > 0;

CREATE INDEX checks_next_heartbeat ON checks(next_heartbeat_due_at) WHERE next_heartbeat_due_at IS NOT NULL;
CREATE INDEX checks_pending_runs ON checks(id) WHERE pending_runs != '[]';
CREATE INDEX checks_pending_retry ON checks(id) WHERE pending_retry IS NOT NULL;
DROP INDEX checks_heartbeat;
