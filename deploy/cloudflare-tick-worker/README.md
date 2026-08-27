# verifyruns-tick — Cloudflare Worker cron

Calls `POST /api/internal/tick` every minute so heartbeats, queued runs and retries are processed promptly, and so a free-tier API host never idles long enough to sleep.

```bash
npm i -g wrangler
wrangler login
# edit wrangler.toml → TICK_URL = your API URL
wrangler secret put TICK_SECRET        # paste VR_TICK_SECRET from the API host
wrangler deploy
```

Check it: `curl "https://verifyruns-tick.<your-subdomain>.workers.dev/?secret=<TICK_SECRET>"` → `{"heartbeats":0,"retries":0,"queued":0}`.

Cron Triggers are included in the Workers free plan; this Worker uses ~1,440 of the 100,000 daily free requests.
