-- A reset can be consumed only by one request in the password-write transaction.
ALTER TABLE password_resets ADD COLUMN consumed_by TEXT;

-- Expiring leases allow another invocation to resume interrupted manual/queued runs.
ALTER TABLE checks ADD COLUMN run_lease_token TEXT;
ALTER TABLE checks ADD COLUMN run_lease_until TEXT;

-- Only pending notifications live here; acknowledged events are removed. Targets in
-- payload remain encrypted using the same format as checks.alert_channels.
CREATE TABLE alert_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE REFERENCES check_runs(id) ON DELETE CASCADE,
  check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  enqueue_token TEXT NOT NULL,
  payload TEXT NOT NULL,
  results TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT
);
CREATE INDEX alert_outbox_due ON alert_outbox(next_attempt_at);
CREATE INDEX alert_outbox_check ON alert_outbox(check_id, seq);
