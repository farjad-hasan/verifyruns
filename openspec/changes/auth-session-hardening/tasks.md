## 1. Tests first (worker/test/)

- [ ] 1.1 clientIp: spoofed `X-Forwarded-For` variants all bucket by `CF-Connecting-IP`; absent CF header → shared fallback bucket
- [ ] 1.2 reset invalidates sessions: token issued pre-reset → 401 after; reset's own returned token → 200; pre-migration token (no version claim) still works until a reset
- [ ] 1.3 login on unknown email performs the dummy verification (assert via instrumented hash counter in the test env, not wall clock)
- [ ] 1.4 hash upgrade: seed a 100k-iteration hash, login → stored hash now records 600k and verifies
- [ ] 1.5 migration 0004 applies over 0001–0003 in the workerd harness

## 2. Migration + worker

- [ ] 2.1 `migrations/0004_token_version.sql`: `users.token_version INTEGER NOT NULL DEFAULT 0`
- [ ] 2.2 `http.ts`: `clientIp` = `cf-connecting-ip` ?? `"unknown"`
- [ ] 2.3 `crypto.ts`: JWT `ver` claim; hash format carries iterations; verify-by-stored-count
- [ ] 2.4 `routes.ts`: `currentUser` compares `ver` (absent → 0); login dummy-hash path + rehash-on-login; `reset.ts` increments `token_version`
- [ ] 2.5 `wrangler.toml`: `VR_PBKDF2_ITERATIONS = "600000"`

## 3. Docs

- [ ] 3.1 `docs/security.md`: update the passwords paragraph (600k, stored-count, rehash) and the known-gaps table (remove timing oracle, session-survives-reset; keep lockout/verification absent)
- [ ] 3.2 `docs/self-hosting.md`: env table row for `VR_PBKDF2_ITERATIONS`; note the CF-header dependency for rate limiting off-Cloudflare

## 4. Verify locally, then push

- [ ] 4.1 Full suite green; typecheck clean; measure one login's CPU ms with `wrangler tail` against the Workers budget and record the number in deploy.md
- [ ] 4.2 Live: reset own password → other browser session is logged out on its next request
- [ ] 4.3 Commit; push; update `memory/PRD.md`
