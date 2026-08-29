## Why

Two input paths accept values the rest of the system assumes were checked. `PATCH /api/checks/{id}` stores any string as `connector_kind`, and a kind change without a `config` leaves the old connector's config under the new kind — the next run fails with an internal error instead of a validation message. Alert channel targets (Slack/Discord webhook URLs, the legacy Slack field, email addresses) are encrypted and stored without any shape check: a private or metadata address is refused for destinations but accepted for alert targets, so the egress policy has a hole the width of a webhook, and a mistyped email is only discovered when the first alert fails.

## What Changes

- `PATCH`: an unknown `connector_kind` is 400 `Unknown connector kind: <kind>`; changing the kind without sending `config` is 400 `config is required when changing connector_kind`.
- Alert targets are validated everywhere they are accepted (`POST /api/checks` channels and legacy `alert_slack_webhook`, `PATCH` legacy field, `POST /api/checks/{id}/channels`): slack/discord targets must be `http(s)` URLs that pass the egress policy (same message as destinations); email targets must be email addresses. Errors are 422 validation errors with `loc` pointing at the field.

## Capabilities

### Modified Capabilities
- `checks`: update validates the kind/config pair; channel targets validated at save time.

## Impact

`worker/src/routes.ts`, `worker/src/validate.ts`; `worker/test/hardening.test.ts`. No migration.
