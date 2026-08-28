## Context

`backend/server.py` (~1,700 lines) is the API: JWT auth, Check CRUD, three connectors, the verdict engine, alerts, heartbeat/tick, data minimisation, egress policy, plans/interest. All of it is request/response over a database plus one idempotent tick. Workers provide `fetch` (HTTP), `scheduled` (cron), D1 (SQLite), WebCrypto, outbound `fetch`, and TCP sockets; they do not provide long-lived processes, Node-native crypto (bcrypt), or MongoDB drivers.

## Goals / Non-Goals

**Goals:** byte-compatible API (paths, payloads, status codes, messages); the same verdict wording; the same OpenSpec behaviour where the platform allows, and an explicit spec delta where it does not; vitest-pool-workers tests running in `workerd` with a real D1 binding; `wrangler dev` as the local stack.

**Non-Goals:** Python Workers; keeping MongoDB; multi-region/durable-object rate limiting; migrating data (none exists); removing `backend/` in this change.

## Decisions

- **One Worker, two handlers.** `fetch` serves `/api/*`; `scheduled` runs `tick()` every minute. Lazy tick on traffic stays (`ctx.waitUntil`). `POST /api/internal/tick` stays for parity and manual runs.
- **D1 schema mirrors the Mongo documents**: scalar columns for what is queried (ids, user_id, timestamps, verdict, trigger, webhook_secret, public_token, heartbeat_hours, snooze_until, last_alerted_verdict, store_samples, retry_before_alert), JSON text columns for the rest (`config`, `expectations`, `alert_channels`, `pending_retry`, `pending_runs`, `fingerprint`, `alerts_sent`). Timestamps stay ISO-8601 UTC strings so the comparisons in the tick are unchanged.
- **Atomicity without Mongo's `find_one_and_update`**: D1 statements are individually atomic; conditional `UPDATE … WHERE …` with `changes()` gives the same single-winner semantics for the lazy-tick claim, the retry drain and the queued-run swap. `db.batch()` for multi-statement writes.
- **Crypto:** `ENC_KEY` = 32 random bytes base64; AES-GCM with a 12-byte IV, stored as base64(iv‖ciphertext). PBKDF2-SHA256, 32-byte salt, iterations from `VR_PBKDF2_ITERATIONS` (default 100,000; measured on the real deploy before shipping — `limits.cpu_ms` in wrangler.toml raises the CPU ceiling if needed). JWT HS256 via `crypto.subtle` with `timingSafeEqual`-style comparison.
- **HTTP/JSON connector:** `fetch` with `redirect: "manual"` (redirects refused), `AbortSignal.timeout(20_000)`, body streamed and abandoned past `VR_MAX_RESPONSE_BYTES`.
- **Airtable:** page one full, later pages `fields[]`, newest by `createdTime` across pages with a single-record fetch — as today — but capped at `VR_AIRTABLE_MAX_PAGES` (default 40) so pages + newest fetch + alert posts fit in the free plan's 50 subrequests per request. `count_capped` and the message say so.
- **Postgres:** the `postgres` driver over Workers TCP sockets (`nodejs_compat`). The least certain piece: if it fails on the platform, the connector returns a clear FAIL ("Postgres is not reachable from this host") rather than blocking the port; Hyperdrive is the documented upgrade path.
- **Rate limiting:** in-memory sliding window per isolate — best effort, documented as such; the Cloudflare rate-limit binding is the upgrade path.
- **Egress:** literal IPs, `localhost` and metadata hostnames are refused at save and fetch time; DNS is not resolved (no resolver in Workers without extra subrequests). Workers' network cannot reach RFC 1918 space, which is the platform-level guarantee.
- **Sample expiry:** the cron tick runs `DELETE FROM run_samples WHERE expires_at < now`.
- **Tests:** `@cloudflare/vitest-pool-workers` with `wrangler.toml` bindings, migrations applied in `setup`; pure-function suites ported from `backend/tests/test_*.py`; API suites use `SELF.fetch`. Postgres tests skip without `VR_TEST_PG_DSN`.
- **Port order = ship order**: auth + checks CRUD → webhook + engine → tick/heartbeat/retry/queue → alerts → egress/limits → samples/plans/interest. Green at each stage; one commit per stage.

## Risks / Trade-offs

- [10 ms CPU on the free plan] → verdict engine is O(sample); PBKDF2 is the only heavy CPU; measured on deploy, `limits.cpu_ms` if needed.
- [50 subrequests per request] → Airtable cap; inline webhook with many alert channels counts too; all documented.
- [Per-isolate rate limits] → weaker than before; stated in the spec delta.
- [Postgres driver on Workers] → graceful FAIL + Hyperdrive path.
- [Two APIs during the port] → `backend/` untouched; parity is the gate; removal is a separate change.
