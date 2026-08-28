## 1. Scaffold

- [ ] 1.1 `worker/` with wrangler.toml (D1 binding, cron, nodejs_compat), tsconfig, vitest-pool-workers config applying `migrations/`, `0001_init.sql`
- [ ] 1.2 `wrangler dev` boots with a local D1; `GET /api/` returns `{app: "VerifyRuns", ok: true}`

## 2. Stage A — auth + checks CRUD (parity with test_auth/backend_test)

- [ ] 2.1 Tests: register/login/me/delete-me, duplicate email, wrong password, token gate; create/list/get/patch/delete checks, secret masking, user isolation, connector config validation
- [ ] 2.2 `crypto.ts` (AES-GCM, PBKDF2, HS256 JWT), `db.ts` (row ↔ document), `routes/auth.ts`, `routes/checks.ts`, sanitiser

## 3. Stage B — webhook + verdict engine

- [ ] 3.1 Tests ported: verdict engine (growth/steady/claimed, field rules, newest window, messages), claimed parsing, fingerprint/split-sample/hash, HTTP-JSON + Airtable connectors via mocked `fetch`
- [ ] 3.2 `engine.ts`, `connectors/{http,airtable,postgres}.ts`, `execute.ts`; inline webhook, `?wait=0` queue, manual run, run history, public status

## 4. Stage C — tick

- [ ] 4.1 Tests: heartbeat due/message, retry-as-data drain, queued drain, lazy-tick claim, `/api/internal/tick` secret, sample expiry sweep
- [ ] 4.2 `tick.ts`; `scheduled` handler; lazy tick via `ctx.waitUntil`

## 5. Stage D — alerts, egress, limits, plans

- [ ] 5.1 Tests: channels CRUD, delivery payloads (Slack/Discord/email via mocked fetch), alerts_sent, snooze, egress literals, rate limits, plans/interest, meta
- [ ] 5.2 `alerts.ts`, `egress.ts`, `ratelimit.ts`, `routes/plans.ts`

## 6. Parity + docs

- [ ] 6.1 Frontend against `wrangler dev` (`REACT_APP_BACKEND_URL=http://localhost:8787`): sign up, create Check, run, webhook, alerts card, pricing, data page — checked in Edge
- [ ] 6.2 n8n node request shape unchanged (its tests already assert it)
- [ ] 6.3 Spec deltas archived-ready; `docs/deploy.md` rewritten (D1 create, secrets, `wrangler deploy`, Pages); `docs/self-hosting.md` Workers section; README stack line
- [ ] 6.4 Commit per stage; push

## 7. Deploy (needs Farjad's `wrangler login`)

- [ ] 7.1 `wrangler d1 create verifyruns` → id into wrangler.toml; `migrate:remote`
- [ ] 7.2 `wrangler secret put` JWT_SECRET, ENC_KEY, VR_TICK_SECRET; `wrangler deploy`; `GET /api/` live
- [ ] 7.3 Pages project from the repo with `REACT_APP_BACKEND_URL` = Worker URL; update `PUBLIC_APP_URL`/`CORS_ORIGINS`
- [ ] 7.4 End-to-end on the live URL: sign up, Check, webhook, tick
