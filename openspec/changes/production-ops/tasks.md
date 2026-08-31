## 0. Prerequisites

- [ ] 0.1 `tick-run-durability` merged (provides `tick_last_ok_at`)
- [ ] 0.2 `alert-delivery-durability` merged (provides `meta.alert_delivery_failures`)

## 1. Tests first (worker/test/health.test.ts)

- [ ] 1.1 health keys `ok` off `tick_last_ok_at`; start-stamp-only staleness → 503; response carries `tick_ok_age_seconds` and `alert_delivery_failures`; old `tick_age_seconds` field retained

## 2. Worker + config

- [ ] 2.1 `routes.ts` health handler per spec
- [ ] 2.2 `wrangler.toml`: `[env.staging]` (worker name, staging D1 id, same vars); `package.json`: `migrate:staging`, `deploy:staging`

## 3. Operations (outside the repo, documented inside it)

- [ ] 3.1 Move `ENC_KEY`, `JWT_SECRET`, `VR_TICK_SECRET` into the password manager; delete the dotfile note or mark it a cache
- [ ] 3.2 Create the external uptime monitors (`/api/health` 200-with-`"ok":true` keyword; Pages origin 200), alert email verified by forcing one failure
- [ ] 3.3 Take the first `wrangler d1 export`; rehearse restore into a scratch D1; record both command transcripts in deploy.md
- [ ] 3.4 Create the staging Worker + D1; run the full migration chain against it

## 4. Frontend + docs

- [ ] 4.1 `robots.txt`: `Disallow: /status/`; `PublicStatus.jsx` sets `noindex` meta; enable-confirm dialog in `CheckDetail.jsx`
- [ ] 4.2 `docs/deploy.md`: Backups & restore section, key custody, staging checklist, external monitor config; note monitor.yml's auto-disable beside its description
- [ ] 4.3 `docs/self-hosting.md`: mirror the backup/Time Travel guidance; add the missing `VR_HEALTH_MAX_TICK_AGE_SECONDS` row
- [ ] 4.4 Rewrite `CLAUDE.md` (delete the FastAPI/Mongo/pytest/yarn sections; point at `worker/`, `openspec/specs/`, `docs/deploy.md`, `DESIGN.md`, `memory/PRD.md`) and fix `README.md` (drop the MongoDB setup block, Fernet → AES-256-GCM); resolve the npm/yarn lockfile split one way

## 5. Verify locally, then push

- [ ] 5.1 Full suite green; staging deploy + smoke passes; break staging's cron secret briefly → external monitor alerts
- [ ] 5.2 Google `site:verifyruns.pages.dev/status` after a re-crawl window shows nothing (spot-check later; record the date)
- [ ] 5.3 Commit; push; update `memory/PRD.md`
