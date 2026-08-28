-- One-time password-reset tokens: only the SHA-256 of the token is stored.
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX resets_user ON password_resets(user_id);
CREATE INDEX resets_expires ON password_resets(expires_at);
