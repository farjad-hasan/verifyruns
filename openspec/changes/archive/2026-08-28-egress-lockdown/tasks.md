## 1. Tests first

- [x] 1.1 Pure: `_egress_violation` rejects metadata, loopback, `localhost`, RFC 1918, IPv6 loopback/ULA, unresolvable hosts, Postgres DSN hosts; accepts a public host; `allow_private=True` accepts everything resolvable
- [x] 1.2 Pure: `_RateLimiter(limit, window)` allows `limit` calls per key then refuses; keys are independent; window expiry re-allows
- [x] 1.3 Streamed read: a mock transport serving > cap bytes → the FAIL message, and the body is not retained
- [x] 1.4 Enforcement against a second uvicorn (:8001, `VR_ALLOW_PRIVATE_EGRESS=0`, auth limit 5, hook limit 3): private HTTP and Postgres Checks refused with 400; 6th login → 429 with `Retry-After`; 4th webhook → 429; public destination still saves

## 2. Backend

- [x] 2.1 `_egress_violation`, `EGRESS_ALLOW_PRIVATE`, `MAX_RESPONSE_BYTES`; called in `_prepare_config_for_storage` (400) and `_fetch_records` (FAIL)
- [x] 2.2 Streamed, capped HTTP/JSON read
- [x] 2.3 `_RateLimiter` + `_client_ip(request)`; applied to register, login, webhook, create_check; 429 + `Retry-After`
- [x] 2.4 Local `.env` gets `VR_ALLOW_PRIVATE_EGRESS=1` (dev Postgres and the test catcher are on localhost); README/self-hosting document the switch and limits

## 3. Verify locally, then push

- [x] 3.1 Full suite green on the :8000 dev server with private egress allowed (count pasted from pytest)
- [x] 3.2 Commit; push; PRD updated
