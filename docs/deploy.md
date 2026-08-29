# Deploying VerifyRuns for $0 — all on Cloudflare

**Live since 2026-08-28:** API `https://verifyruns-api.farjad-developer.workers.dev` (D1 `verifyruns`, cron every minute), frontend `https://verifyruns.pages.dev` (Pages project `verifyruns`, direct upload). Secrets are set; copies live in `~/.verifyruns-secrets.env` on the Mac (owner-only). Redeploy the API with `cd worker && npm run deploy`; redeploy the frontend with `cd frontend && REACT_APP_BACKEND_URL=https://verifyruns-api.farjad-developer.workers.dev npm run build && cd ../worker && npx wrangler pages deploy ../frontend/build --project-name verifyruns --branch main`.

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
- Build command: `npm install --legacy-peer-deps && npm run build`
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
5. `curl -f https://<worker-url>/api/health` → `{"ok":true,"tick_age_seconds":…}`; it answers 503 once the cron has been silent for `VR_HEALTH_MAX_TICK_AGE_SECONDS` (default 600). `.github/workflows/monitor.yml` probes it every 30 minutes and fails loudly; `ci.yml` runs the worker suite and a frontend build on every push.

## Free-plan limits that shape behaviour

- **50 subrequests per request**: an Airtable count stops at `VR_AIRTABLE_MAX_PAGES` (40 → 4,000 records) and the run says "count capped"; alert deliveries in the same inline webhook count too.
- **CPU per request**: measured 2026-08-30 on the live Worker with `wrangler tail` — a 5.03 MB / 28,383-record JSON destination costs **60–74 ms CPU** per run (fetch, parse, fingerprint, verdict, D1 write) and completes with outcome `ok`; a 6 MB body is refused before parsing ("Destination response exceeded 5 MB", `VR_MAX_RESPONSE_BYTES`). That is above the 10 ms the free plan documents, so on a strictly enforced free account lower `VR_MAX_RESPONSE_BYTES` (1 MB ≈ 15 ms) or raise `limits.cpu_ms` in `wrangler.toml`; PBKDF2 sign-up/login is the other heavy step (`VR_PBKDF2_ITERATIONS`).
- **100,000 requests/day**, 5 GB D1 — far above early-access needs.
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
