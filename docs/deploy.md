# Deploying VerifyRuns for $0 — all on Cloudflare

API on **Cloudflare Workers** with **D1**, frontend on **Cloudflare Pages**, scheduling by the Worker's own **cron trigger**. One free account, no card. (The earlier Render + MongoDB Atlas layout is kept at the end as a fallback.)

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

Workers & Pages → Create → Pages → connect `farjad-hasan/verifyruns`:

- Root directory: `frontend`
- Build command: `npm install --legacy-peer-deps && npm run build`
- Output directory: `build`
- Variables: `REACT_APP_BACKEND_URL` = the Worker URL from step 3 (**no trailing slash**), `NODE_VERSION` = `20`

`frontend/public/_redirects` makes deep links (`/checks/<id>`, `/pricing`) load the SPA.

Then point the API at the Pages origin: edit `PUBLIC_APP_URL` and `CORS_ORIGINS` in `worker/wrangler.toml` (`https://<project>.pages.dev`, or your custom domain) and `npm run deploy` again.

## 5. Check it

1. Sign up on the Pages URL; create a Check against `https://jsonplaceholder.typicode.com/todos` with minimum new records `0`; Run check now → PASS.
2. `curl -X POST https://<worker-url>/api/hook/<secret>` → a JSON verdict in the response.
3. `curl -X POST https://<worker-url>/api/internal/tick -H "X-Tick-Secret: …"` → `{"heartbeats":0,"queued":0,"retries":0,"expired_samples":0}`.
4. Cloudflare dashboard → the Worker → Logs: a `tick` line appears whenever something was processed.

## Free-plan limits that shape behaviour

- **50 subrequests per request**: an Airtable count stops at `VR_AIRTABLE_MAX_PAGES` (40 → 4,000 records) and the run says "count capped"; alert deliveries in the same inline webhook count too.
- **10 ms CPU per request** by default: the engine is light; PBKDF2 sign-up/login is the heaviest step. If sign-ups ever time out, lower `VR_PBKDF2_ITERATIONS` or raise `limits.cpu_ms` in `wrangler.toml`.
- **100,000 requests/day**, 5 GB D1 — far above early-access needs.
- Rate limits are per isolate (best effort).

## Local development

```bash
cd worker && npm install
cp .dev.vars.example .dev.vars   # then replace the three placeholder secrets
npm run migrate:local
npm run dev                      # http://localhost:8787
npm test                         # vitest inside workerd with a real D1
```

Frontend: `REACT_APP_BACKEND_URL=http://localhost:8787` in `frontend/.env`, then `PORT=3100 npm start`.

## Fallback: Render + Atlas

`backend/` is the original Python API. `render.yaml` deploys it to Render's free web service (which now requires a card on file) with MongoDB Atlas M0 (project `VerifyRuns`, cluster `verifyruns`, Singapore — created 2026-08-28 and unused by the Cloudflare layout) and `deploy/cloudflare-tick-worker/` as the external scheduler. Same API contract; the full guide is in git history before 2026-08-28.
