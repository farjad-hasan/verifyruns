## 1. Tests first

- [x] 1.1 Webhook without `wait` returns the verdict inline and the run exists before the response (no polling); `wait` still accepted
- [x] 1.2 `/api/internal/tick`: 401 on wrong/missing secret; 200 `{heartbeats, retries}` with the secret from `.env`
- [x] 1.3 Retry as data: fresh FAIL with `retry_before_alert` sets `pending_retry` (visible as `pending_retry_at` on the Check); `_tick(now=due)` runs a `trigger="retry"` run and clears it; `_tick(now=before due)` does nothing
- [x] 1.4 `test_webhook_wait` contract test updated to the inline shape

## 2. Backend

- [x] 2.1 Inline webhook; `wait` accepted and ignored; `WEBHOOK_WAIT_MAX_SECONDS` retired
- [x] 2.2 `pending_retry` on the Check; `_drain_retries(now, database)`; `_tick(now, database)` = heartbeat sweep + retry drain; `_heartbeat_loop` calls `_tick` and is gated by `VR_INTERNAL_TICKER`
- [x] 2.3 `POST /api/internal/tick` with constant-time secret check; 404 when unconfigured
- [x] 2.4 Sanitiser exposes `pending_retry_at`

## 3. Deployment files

- [x] 3.1 `frontend/public/_redirects`
- [x] 3.2 `render.yaml` (Python web service, `/api/` health check, env vars with secrets `sync: false`, `VR_INTERNAL_TICKER=0`)
- [x] 3.3 `docs/deploy.md`: Atlas M0 → Render → Cloudflare Pages → cron-job.org, with the exact env vars and the sleep/cold-start caveat; `docs/self-hosting.md` and `docs/n8n.md` updated for the new webhook contract

## 4. Verify locally, then push

- [x] 4.1 Full suite green with the internal ticker on (count pasted from pytest)
- [x] 4.2 Production build contains `_redirects`
- [x] 4.3 Commit; push; PRD updated
