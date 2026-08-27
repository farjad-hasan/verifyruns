## 1. Tests first

- [x] 1.1 API: `POST /api/interest` records plan + email + note; 422 on unknown plan; 401 logged out
- [x] 1.2 API: `GET /api/plans` is public, `early_access: true`, three plans with `planned_price` and `limits`

## 2. Backend

- [x] 2.1 `PLANS` constant, `VR_EARLY_ACCESS`, `GET /api/plans`
- [x] 2.2 `InterestIn`, `POST /api/interest` → `interest` collection

## 3. Frontend

- [x] 3.1 `/pricing`: early-access banner, three cards from `/api/plans`, "I'd pay for …" → interest (logged out → sign-up), Free → dashboard/sign-up

## 4. Verify locally, then push

- [x] 4.1 Full suite green (count pasted from pytest); production build compiles; page checked in Edge
- [x] 4.2 Commit; push; PRD updated

## Deferred to `billing-paddle` (open when the interest list justifies it)

- [ ] Paddle account + approval (needs the live site and this pricing page)
- [ ] `plan` on users; server-side limits (Check count, history window, connectors, channels) with 402s
- [ ] Paddle checkout + webhook → plan updates; customer portal link
