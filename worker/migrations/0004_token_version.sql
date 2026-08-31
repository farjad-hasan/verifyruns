-- Session invalidation on password reset (auth-session-hardening).
-- currentUser compares the JWT's `ver` claim (absent = 0, grandfathering pre-deploy tokens)
-- against this column; a reset increments it, killing every previously issued JWT.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
