## 1. Scaffold

- [x] 1.1 `worker/` with wrangler.toml (D1 binding, cron, nodejs_compat), tsconfig, vitest-pool-workers config applying `migrations/`, `0001_init.sql`
- [x] 1.2 `wrangler dev` boots with a local D1; `GET /api/` returns `{app: "VerifyRuns", ok: true}`

## 2. Stage A — auth + checks CRUD (parity with test_auth/backend_test)

- [x] 2.1 Tests: register/login/me/delete-me, duplicate email, wrong password, token gate; create/list/get/patch/delete checks, secret masking, user isolation, connector config validation
- [x] 2.2 `crypto.ts` (AES-GCM, PBKDF2, HS256 JWT), `db.ts` (row ↔ document), `routes/auth.ts`, `routes/checks.ts`, sanitiser

## 3. Stage B — webhook + verdict engine

- [x] 3.1 Tests ported: verdict engine (growth/steady/claimed, field rules, newest window, messages), claimed parsing, fingerprint/split-sample/hash, HTTP-JSON + Airtable connectors via mocked `fetch`
- [x] 3.2 `engine.ts`, `connectors/{http,airtable,postgres}.ts`, `execute.ts`; inline webhook, `?wait=0` queue, manual run, run history, public status

## 4. Stage C — tick

- [x] 4.1 Tests: heartbeat due/message, retry-as-data drain, queued drain, lazy-tick claim, `/api/internal/tick` secret, sample expiry sweep
- [x] 4.2 `tick.ts`; `scheduled` handler; lazy tick via `ctx.waitUntil`

## 5. Stage D — alerts, egress, limits, plans

- [x] 5.1 Tests: channels CRUD, delivery payloads (Slack/Discord/email via mocked fetch), alerts_sent, snooze, egress literals, rate limits, plans/interest, meta
- [x] 5.2 `alerts.ts`, `egress.ts`, `ratelimit.ts`, `routes/plans.ts`

## 6. Parity + docs

- [x] 6.1 Frontend against `wrangler dev` (`REACT_APP_BACKEND_URL=http://localhost:8787`): sign up, create Check, run, webhook, alerts card, pricing, data page — checked in Edge
- [x] 6.2 n8n node request shape unchanged (its tests already assert it)
- [x] 6.3 Spec deltas archived-ready; `docs/deploy.md` rewritten (D1 create, secrets, `wrangler deploy`, Pages); `docs/self-hosting.md` Workers section; README stack line
- [x] 6.4 Commit per stage; push

## 7. Deploy (needs Farjad's `wrangler login`)

- [x] 7.1 `wrangler d1 create verifyruns` → id into wrangler.toml; `migrate:remote`
- [x] 7.2 `wrangler secret put` JWT_SECRET, ENC_KEY, VR_TICK_SECRET; `wrangler deploy`; `GET /api/` live
- [x] 7.3 Pages project from the repo with `REACT_APP_BACKEND_URL` = Worker URL; update `PUBLIC_APP_URL`/`CORS_ORIGINS`
- [x] 7.4 End-to-end on the live URL: sign up, Check, webhook, tick
