## Why

Next week's OPG reviewers must see a product whose promises match its verdicts. Today setup can provide little protection, incomplete reads can look successful, and pricing advertises unfinished capabilities.

## What Changes

- Position the alpha as destination count and field monitoring for scheduled, append-only syncs, with explicit limits and a public setup guide.
- **BREAKING**: fail closed when a configured assertion cannot be evaluated; establish a count baseline before asserting growth. Compare counts with the preceding readable observation rather than borrowing growth from older PASS runs. Retries retain their original baseline.
- Keep the PASS/FAIL API and interpret claimed counts consistently as a minimum. Explain that aggregate checks do not prove record identity or value correctness.
- Improve setup defaults, baseline guidance, alert testing, connector examples, pricing availability, and error feedback.
- Exercise the complete alpha journey and document a repeatable OPG demonstration and release evidence.

## Capabilities

### New Capabilities
- `alpha-readiness`: an honest, repeatable setup and review journey, including alert testing and an evidence-based release checklist.

### Modified Capabilities
- `verdict-engine`: count baselines, incomplete assertions and precise verdict messages.
- `marketing-site`: bounded positioning and explicit current-versus-planned functionality.

## Impact

Write boundary: `worker/src/engine.ts`, `execute.ts`, `tick.ts`, `checks.ts`, `routes.ts`, `index.ts`, `alerts.ts`, `connectors.ts`, `validate.ts`; `worker/test/*.test.ts`; `worker/vitest.config.ts`; `worker/wrangler.toml`; `.github/workflows/{ci,deploy}.yml`; `frontend/src/pages/{Landing,Pricing,NewCheck,CheckDetail,Dashboard,PublicStatus,DataPage,SecurityPage,AuthPage,PrivacyPage}.jsx`; `frontend/src/components/{ExpectationsFields,Footer}.jsx`; `frontend/src/{App.js,index.css}`; `frontend/src/lib/useTitle.js`; `frontend/public/{index.html,manifest.json}`; `worker/src/plans.ts`; `README.md`, `PRODUCT.md`, `DESIGN.md`; `docs/*.md`; new `frontend/src/pages/SetupPage.jsx`; `scripts/alpha-smoke.mjs`, `scripts/alpha-live-smoke.mjs`; `openspec/specs/{verdict-engine,marketing-site,alpha-readiness}/spec.md`; this change's artifacts and `openspec/CLAIMS.md`. Existing untracked marketing drafts are reference only; replacement review/outreach copy lives in `docs/alpha-review.md`.

No new billing, source reconciliation platform, analytics, or agency management. No visual token changes planned. No other active owner overlaps these files; pricing-tiers remains deferred.
