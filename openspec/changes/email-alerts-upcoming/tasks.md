## 1. Claim and openspec

- [x] 1.1 Claim `email-alerts-upcoming` in `openspec/CLAIMS.md` (owner Dev, branch `email-alerts-upcoming`)
- [x] 1.2 Proposal + tasks + spec deltas for checks/auth

## 2. Worker

- [x] 2.1 `/meta` returns `{ password_reset, email_alerts }`; `email_alerts` defaults false unless `VR_EMAIL_ALERTS=1`
- [x] 2.2 POST create-check / add-channel email returns upcoming error unless `VR_EMAIL_ALERTS=1` (then existing RESEND gate)
- [x] 2.3 Update `checks.test.ts` for meta shape and email gate
- [x] 2.4 Gate `deliver`/outbox email send on `VR_EMAIL_ALERTS`; update `alerts.test.ts` (+ alpha testChannel fixture)
- [x] 2.5 Gate password reset on `VR_PASSWORD_RESET` (default off); hide login forgot link; transactional Resend path separate from alert delivery

## 3. Frontend + copy

- [x] 3.1 ForgotPage uses `password_reset`
- [x] 3.2 CheckDetail AlertChannelsCard + NewCheck: Email disabled as `Email · upcoming` with helper text
- [x] 3.3 Pricing Available today, Landing, Setup, plans.ts, PRODUCT.md, README, Privacy soft-land

## 4. Verify, then push

- [x] 4.1 `cd worker && npm test` (rerun flake alone if needed) + typecheck if touched
- [x] 4.2 `cd frontend && yarn build` if frontend changed
- [x] 4.3 `openspec validate --all --strict`
- [ ] 4.4 Push branch and open PR to `main` — do not merge or deploy
