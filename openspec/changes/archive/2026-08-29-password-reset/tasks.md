## 1. Tests first (worker/test/reset.test.ts)
- [x] 1.1 forgot: known email → 200, one Resend call to that address with a `/reset?token=` link; row stores sha256(token)
- [x] 1.2 forgot: unknown email → 200, no fetch
- [x] 1.3 forgot: email not configured → 503 with the sentence
- [x] 1.4 reset: valid token → 200 + login token; old password 401, new password 200; second use 400
- [x] 1.5 reset: expired token → 400; short password → 422
- [x] 1.6 tick expiry sweep deletes expired tokens

## 2. Worker
- [x] 2.1 migration `0002_password_resets.sql`
- [x] 2.2 `forgot` + `reset` handlers, routes, `sendEmail` seam shared with alerts
- [x] 2.3 `expireSamples` also purges expired reset tokens; `deleteMe` purges the user's tokens

## 3. Frontend
- [x] 3.1 "Forgot password?" link on login; `/forgot` page; `/reset` page; routes
- [x] 3.2 Production build; flow exercised in Edge against the live API with the sandbox sender (own address)

## 4. Docs + deploy
- [x] 4.1 `docs/security.md`, `SecurityPage.jsx`, README: reset described, gap removed
- [x] 4.2 `npm run migrate:remote`, `npm run deploy`, Pages deploy; suite count pasted; archive
