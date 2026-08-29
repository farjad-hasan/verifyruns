## 1. Tests first (worker/test/concurrency.test.ts)
- [x] 1.1 two heartbeatTicks at the same instant → one heartbeat run, one alert delivery
- [x] 1.2 ten parallel `?wait=0` webhooks → ten queued, ten executed by the next tick; `enqueueRun` onto a seeded queue keeps the seeded item
- [x] 1.3 two maybeAlerts for the same fresh FAIL → one delivery; PASS after FAIL claimed once
- [x] 1.4 RateLimiter forgets keys whose window emptied

## 2. Worker
- [x] 2.1 heartbeat insert guarded by NOT EXISTS; count + alert only when the insert landed
- [x] 2.2 `enqueueRun` with `json_insert`; webhook uses it
- [x] 2.3 maybeAlert claims with a predicated UPDATE before delivering
- [x] 2.4 RateLimiter prune deletes empty keys

## 3. Verify
- [x] 3.1 full suite green, typecheck clean, specs validated
