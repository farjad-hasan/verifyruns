## Why

Resend secrets are live for password-reset dogfood, but there is no Resend-verified sending domain for product alert email. `/meta` currently exposes a single `email_alerts` flag derived from those secrets, so the UI treats alert email as available whenever reset mail works — and marketing copy lists Email alongside Slack/Discord as live. Operators would add email channels that cannot be productized yet.

## What Changes

- Split `/meta` into `password_reset` (from `RESEND_API_KEY` + `ALERT_FROM`) and `email_alerts` (false by default; set `VR_EMAIL_ALERTS=1` to re-enable later).
- Forgot password uses `password_reset`. Alert channel UI and creation use `email_alerts`.
- Reject adding email alert channels with a clear upcoming error even when Resend secrets exist, unless `VR_EMAIL_ALERTS=1` (then the existing not-configured gate still applies if secrets are missing).
- Gate email alert *delivery* on the same `VR_EMAIL_ALERTS` flag (default off) so pre-existing email channels do not keep sending; password-reset mail via Resend stays independent of the flag.
- UI: Email option labeled `Email · upcoming` and disabled; helper “Email alerts are next. Use Slack or Discord for now.” Slack/Discord unchanged.
- Marketing/docs: Available today and setup mention Slack/Discord only; Email stays only under proposed Pro packages; Privacy ties Resend to password-reset without implying live alert email.

## Capabilities

### Modified Capabilities
- `checks`: email channel creation gated by upcoming flag / `VR_EMAIL_ALERTS`.
- `auth`: `/meta` shape and forgot-password availability use `password_reset`.

## Impact

- `worker/src/env.ts`, `worker/src/routes.ts`, `worker/wrangler.toml` (optional `VR_EMAIL_ALERTS` note)
- `worker/test/checks.test.ts`
- `frontend/src/pages/{ForgotPage,CheckDetail,NewCheck,Pricing,Landing,SetupPage,PrivacyPage}.jsx`
- `worker/src/plans.ts`, `PRODUCT.md`, `README.md`
- `openspec/CLAIMS.md`, `openspec/changes/email-alerts-upcoming/**`
