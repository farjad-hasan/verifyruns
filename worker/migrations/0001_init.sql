-- VerifyRuns on D1. Timestamps are ISO-8601 UTC strings; JSON columns hold the document-shaped parts.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  connector_kind TEXT NOT NULL,
  config TEXT NOT NULL,              -- JSON, secrets encrypted inside
  expectations TEXT NOT NULL,        -- JSON
  webhook_secret TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  retry_before_alert INTEGER NOT NULL DEFAULT 1,
  heartbeat_hours INTEGER,
  store_samples INTEGER NOT NULL DEFAULT 0,
  alert_slack_webhook_encrypted TEXT,
  alert_channels TEXT NOT NULL DEFAULT '[]',   -- JSON list
  public_token TEXT UNIQUE,
  snooze_until TEXT,
  last_alerted_verdict TEXT,
  pending_retry TEXT,                -- JSON {due_at, claimed_new} or NULL
  pending_runs TEXT NOT NULL DEFAULT '[]'      -- JSON list
);
CREATE INDEX checks_user ON checks(user_id);
CREATE INDEX checks_heartbeat ON checks(heartbeat_hours);

CREATE TABLE check_runs (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  trigger TEXT NOT NULL,
  verdict TEXT NOT NULL,
  diff_message TEXT NOT NULL,
  fingerprint TEXT NOT NULL,         -- JSON (redacted)
  error_details TEXT,
  is_retry INTEGER NOT NULL DEFAULT 0,
  count_capped INTEGER NOT NULL DEFAULT 0,
  count_estimated INTEGER NOT NULL DEFAULT 0,
  claimed_new INTEGER,
  body_note TEXT,
  heartbeat_at TEXT,
  alerts_sent TEXT                   -- JSON list or NULL
);
CREATE INDEX runs_check_ts ON check_runs(check_id, timestamp DESC);

CREATE TABLE run_samples (
  run_id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL,
  newest_record TEXT,                -- JSON
  newest_window TEXT,                -- JSON
  error_details TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX samples_expires ON run_samples(expires_at);
CREATE INDEX samples_check ON run_samples(check_id);

CREATE TABLE interest (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta(key, value) VALUES ('tick_last_at', '1970-01-01T00:00:00.000Z');
