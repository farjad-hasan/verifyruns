-- reported-failure: a webhook body may say {"status": "failed", "error": "…"}; the run records it
-- and is a FAIL regardless of the destination. Nullable/defaulted so existing rows are untouched.
ALTER TABLE check_runs ADD COLUMN reported_failure INTEGER NOT NULL DEFAULT 0;
ALTER TABLE check_runs ADD COLUMN reported_error TEXT;
