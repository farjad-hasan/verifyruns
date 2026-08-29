## 1. Tests first (worker/test/health.test.ts)
- [x] 1.1 fresh tick → 200 {ok:true, tick_age_seconds}; stale → 503 {ok:false}
- [x] 1.2 security headers on every API response; health is no-store

## 2. Worker
- [x] 2.1 `/api/health` route + `VR_HEALTH_MAX_TICK_AGE_SECONDS`
- [x] 2.2 headers set in the fetch wrapper

## 3. Site + CI
- [x] 3.1 `frontend/public/_headers` (CSP etc.), verified in Edge on the deployed site: landing loads, no CSP violations from the app itself, `/api/meta` reachable
- [x] 3.2 `ci.yml` green on GitHub; `monitor.yml` green on its first manual run
- [x] 3.3 docs: deploy.md (headers, CI, monitor), security.md (headers + monitor lines)
