# Deploying VerifyRuns for $0 — all on Cloudflare

**Live since 2026-08-28:** API `https://verifyruns-api.farjad-developer.workers.dev` (D1 `verifyruns`, cron every minute), frontend `https://verifyruns.pages.dev` (Pages project `verifyruns`, direct upload). Secrets are set; copies live in `~/.verifyruns-secrets.env` on the Mac (owner-only). Redeploy the API with `cd worker && npm run deploy`; redeploy the frontend with `cd frontend && REACT_APP_BACKEND_URL=https://verifyruns-api.farjad-developer.workers.dev REACT_APP_POSTHOG_KEY=phc_pvRHXAdUAzreQzCNxcu6b7JezduKoE4BXgTMvSBSesau npm run build && cd ../worker && npx wrangler pages deploy ../frontend/build --project-name verifyruns --branch main`.

API on **Cloudflare Workers** with **D1**, frontend on **Cloudflare Pages**, scheduling by the Worker's own **cron trigger**. One free account, no card.

Everything below is driven by **Wrangler**, Cloudflare's CLI (`npm i -g wrangler`, then `wrangler login` once — it opens a browser to approve access to your account).

## 1. Database (D1)

```bash
cd worker
wrangler d1 create verifyruns
```

Copy the `database_id` it prints into `worker/wrangler.toml` (`[[d1_databases]] … database_id = "…"`), then apply the schema:

```bash
npm run migrate:remote        # wrangler d1 migrations apply verifyruns --remote
                              # ALWAYS before `deploy`: new code may read new columns on every
                              # request (0004's token_version is read by every authenticated call)
```

## 2. Secrets

```bash
wrangler secret put JWT_SECRET      # any long random string: openssl rand -base64 48
wrangler secret put ENC_KEY         # exactly 32 random bytes, base64: openssl rand -base64 32
wrangler secret put VR_TICK_SECRET  # openssl rand -base64 24
# optional, enables email alerts:
wrangler secret put RESEND_API_KEY
wrangler secret put ALERT_FROM      # e.g. "VerifyRuns <alerts@yourdomain>"
```

`ENC_KEY` encrypts every stored connector secret and alert target — **keep it safe**; losing it makes them unreadable. Rotating `JWT_SECRET` logs everyone out.

## 3. Deploy the API

```bash
npm run deploy                 # wrangler deploy
curl https://verifyruns-api.<your-subdomain>.workers.dev/api/
# → {"app":"VerifyRuns","ok":true}
```

The cron trigger (`* * * * *` in `wrangler.toml`) starts with the deploy: every minute the Worker processes missed heartbeats, queued runs (`?wait=0`), due retries and expired samples. Traffic also ticks lazily. There is no sleeping instance and nothing to keep awake.

## 4. Frontend (Pages)

Either direct upload (what is live now — see the top of this page) or Git integration: Workers & Pages → Create → Pages → connect `farjad-hasan/verifyruns`:

- Root directory: `frontend`
- Build command: `yarn install && yarn build` (yarn is the pinned package manager; `frontend/yarn.lock` is the one lockfile)
- Output directory: `build`
- Variables: `REACT_APP_BACKEND_URL` = the Worker URL from step 3 (**no trailing slash**), `NODE_VERSION` = `20`

`frontend/public/_redirects` makes deep links (`/checks/<id>`, `/pricing`) load the SPA.

`frontend/public/_headers` sets the site's Content-Security-Policy and transport headers. Its `connect-src` names the API origin literally — when you use a custom domain for the API, add it there and rebuild.

Then point the API at the Pages origin: edit `PUBLIC_APP_URL` and `CORS_ORIGINS` in `worker/wrangler.toml` (`https://<project>.pages.dev`, or your custom domain) and `npm run deploy` again.

## 5. Check it

1. Sign up on the Pages URL; create a Check against `https://jsonplaceholder.typicode.com/todos` with minimum new records `0`; Run check now → PASS.
2. `curl -X POST https://<worker-url>/api/hook/<secret>` → a JSON verdict in the response.
3. `curl -X POST https://<worker-url>/api/internal/tick -H "X-Tick-Secret: …"` → `{"heartbeats":0,"queued":0,"retries":0,"expired_samples":0}`.
4. Cloudflare dashboard → the Worker → Logs: a `tick` line appears whenever something was processed.
5. `curl -f https://<worker-url>/api/health` → `{"ok":true,"tick_ok_age_seconds":…}`; `ok` keys off the last *successfully completed* tick (`tick_last_ok_at`), so a cron that starts and then throws every run goes 503 once it exceeds `VR_HEALTH_MAX_TICK_AGE_SECONDS` (default 600). The response also reports `alert_delivery_failures` (a counter, for visibility — it never flips `ok`) and keeps the old `tick_age_seconds` field. `.github/workflows/monitor.yml` probes every 30 minutes as a second opinion — **GitHub disables scheduled workflows after 60 days without repository activity**, which is why the external monitor below is the primary; `ci.yml` runs the worker suite and a frontend build on every push.

## External uptime monitor (primary)

The primary monitor must live outside both this repository and the Cloudflare account. Any free uptime service (UptimeRobot, Better Stack, and similar) works; configure two checks, 5-minute interval, alerting to the owner's email:

1. `GET https://<worker-url>/api/health` — alert unless the response is HTTP 200 **and** the body contains the keyword `"ok":true`.
2. `GET https://verifyruns.pages.dev/` — alert unless HTTP 200.

Verify the alert path once by forcing a failure (e.g. point a third throwaway check at a bogus path and watch the email arrive), then delete the throwaway.

## Backups, keys, and restore

**Key custody.** `ENC_KEY`, `JWT_SECRET` and `VR_TICK_SECRET` belong in a password manager, not only in a dotfile. Losing `ENC_KEY` makes **every stored connector credential and alert target permanently unreadable** — users would have to re-enter them all. Losing `JWT_SECRET` merely logs everyone out. Treat `~/.verifyruns-secrets.env` as a cache of the password-manager entry, never the only copy.

**Scheduled export.** Weekly (calendar reminder or cron on any machine):

```bash
cd worker && npx wrangler d1 export verifyruns --remote --output backup-$(date +%Y%m%d).sql
```

Keep the last few exports somewhere that is not the laptop (cloud drive is fine — the dump contains only encrypted secrets, but treat it as production data).

**D1 Time Travel** is the first response to a bad migration or data corruption: D1 keeps 30 days of point-in-time history on every database, no setup needed. Find a timestamp/bookmark and restore:

```bash
npx wrangler d1 time-travel info verifyruns --timestamp "2026-08-31T10:00:00Z"
npx wrangler d1 time-travel restore verifyruns --timestamp "2026-08-31T10:00:00Z"
```

**Restore rehearsal** (do once, record the transcript here): create a scratch database `wrangler d1 create verifyruns-restore-test`, then `npx wrangler d1 execute verifyruns-restore-test --remote --file backup-<date>.sql`, then point a scratch Worker at it and confirm `/api/health` and one login work. A fresh clone plus the password-manager keys plus the latest export must be sufficient to reach a working deploy.

## CI/CD (push to main deploys)

`.github/workflows/deploy.yml` mechanizes this runbook: every push to `main` touching
`worker/**` or `frontend/**` runs the worker suite, then **staging** (migrate → deploy →
health smoke), and only if staging is green, **production** (migrate → deploy → smoke) and the
Pages build+deploy. One deploy at a time, in commit order (`concurrency: deploy-main`); also
triggerable by hand from the Actions tab (`workflow_dispatch`).

One-time setup — two repository secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — create at dash.cloudflare.com → My Profile → API Tokens with
  **Workers Scripts:Edit, D1:Edit, Cloudflare Pages:Edit** on this account. Store it in the
  password manager alongside the other keys.
- `CLOUDFLARE_ACCOUNT_ID` — printed by `wrangler whoami`.

The manual commands above remain the fallback (and the only path while the secrets are unset —
without them the deploy jobs fail at the first wrangler call while `ci.yml` still guards the
code). Docs-only pushes don't deploy: the workflow's `paths` filter skips them.

## Staging

`wrangler.toml` defines `[env.staging]` (`verifyruns-api-staging` + D1 `verifyruns-staging`). One-time setup: `wrangler d1 create verifyruns-staging`, paste the id into `wrangler.toml`, and set the three secrets with `wrangler secret put <NAME> --env staging`.

Every migration goes through staging first, in this order:

1. `npm run migrate:staging`
2. `npm run deploy:staging`
3. Smoke: `curl -f https://verifyruns-api-staging.<subdomain>.workers.dev/api/health`; one webhook round-trip (register a scratch user, create a Check against `https://jsonplaceholder.typicode.com/todos`, `POST /api/hook/<secret>` → verdict).
4. Only then `npm run migrate:remote` and `npm run deploy`.

## Free-plan limits that shape behaviour

- **50 subrequests per request**: an Airtable count stops at `VR_AIRTABLE_MAX_PAGES` (40 → 4,000 records) and the run says "count capped"; alert deliveries in the same inline webhook count too.
- **CPU per request**: measured 2026-08-30 on the live Worker with `wrangler tail` — a 5.03 MB / 28,383-record JSON destination costs **60–74 ms CPU** per run (fetch, parse, fingerprint, verdict, D1 write) and completes with outcome `ok`; a 6 MB body is refused before parsing ("Destination response exceeded 5 MB", `VR_MAX_RESPONSE_BYTES`). That is above the 10 ms the free plan documents, so on a strictly enforced free account lower `VR_MAX_RESPONSE_BYTES` (1 MB ≈ 15 ms) or raise `limits.cpu_ms` in `wrangler.toml`; PBKDF2 sign-up/login is the other heavy step (`VR_PBKDF2_ITERATIONS`).
- **100,000 requests/day**, 5 GB D1 — far above early-access needs.
- **D1 free plan: 5 million rows read / 100,000 rows written per day.** Since `tick-run-durability`, tick cost is proportional to *due work*, not tenant count: the heartbeat sweep is one range scan over the maintained `next_heartbeat_due_at` partial index, and the `pending_runs`/`pending_retry` sweeps hit partial indexes, so an idle minute-cron against thousands of Checks reads a handful of rows instead of every Check. Each sweep also processes at most `VR_TICK_BATCH` (default 25) items per tick, bounding worst-case bursts. The run-retention sweep runs one pass every 10 minutes (claimed via `meta.retention_last_at`), visits `VR_TICK_BATCH` Checks per pass over a rotating cursor (`meta.retention_cursor`) and deletes at most 200 rows per pass — deletions are writes, so a first-visit backfill of a huge Check drains at ≤ ~29k row-writes/day instead of spending the daily quota in one statement.
- Rate limits are per isolate (best effort).
- **Postgres destinations need a publicly trusted TLS certificate.** Workers' TCP sockets verify server certificates against public CAs only, with no way to add a private CA. Tested 2026-08-28: a Supabase pooler (certificate signed by "Supabase Intermediate 2021 CA") accepts the TLS request and then the handshake is rejected; the run fails within a second with "Postgres connection error: TLS handshake failed." and an explanation. RDS and Cloud SQL sign with private CAs too (not tested). Verified the other way on 2026-08-29: a Neon database (Let's Encrypt certificate) passes over TLS from the edge in ~570 ms, pooler and direct endpoint alike. Options: a database with a publicly trusted certificate (Neon verified; any Let's Encrypt/DigiCert-style issuer should behave the same), `sslmode=disable` in the connection string (cleartext — only over a network you trust), or self-hosting VerifyRuns next to the database. Hyperdrive (free plan, 10 configurations per account) can front a self-hoster's own database but is not a per-Check mechanism. Plain-TCP connections to the same pooler work from the edge.

## Local development

```bash
cd worker && npm install
cp .dev.vars.example .dev.vars   # then replace the three placeholder secrets
npm run migrate:local
npm run dev                      # http://localhost:8787
npm test                         # vitest inside workerd with a real D1
```

Frontend: `REACT_APP_BACKEND_URL=http://localhost:8787` in `frontend/.env`, then `PORT=3100 npm start`.
