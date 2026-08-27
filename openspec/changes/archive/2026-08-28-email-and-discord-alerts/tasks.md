## 1. Tests first

- [x] 1.1 Pure: `_channels(check)` merges the legacy Slack field (id `legacy-slack`) with `alert_channels`
- [x] 1.2 Delivery through a mock transport: Slack posts `{text}`, Discord posts `{content}` capped at 2,000 chars, email posts to Resend with `from`/`to`/`subject`/`text` and the bearer key
- [x] 1.3 API: add/list/delete Discord channel; email channel refused without `RESEND_API_KEY`+`ALERT_FROM`; legacy Slack listed; `alert_channels` accepted on create
- [x] 1.4 End-to-end: a local HTTP catcher registered as a Discord channel receives `{content: ":rotating_light: *FAIL* — …"}` on a forced FAIL (retry_before_alert off) and `alerts_sent` shows `discord: ok`

## 2. Backend

- [x] 2.1 `alert_channels` on the Check; `ChannelIn` model; `POST/DELETE /api/checks/{id}/channels`; `CheckCreate.alert_channels`; sanitiser lists `{id, kind, last4}`
- [x] 2.2 `_deliver_slack/_deliver_discord/_deliver_email` via `_http_client()`; `_maybe_alert` fans out to `_channels(check)` and `$set`s `alerts_sent` on the run
- [x] 2.3 Email gate: `RESEND_API_KEY` + `ALERT_FROM` env; 400 at channel creation when absent

## 3. Frontend

- [x] 3.1 CheckDetail: "Alert channels" card replaces "Slack alerts" — list with kind + last4 + remove, add form with kind select (email option disabled with the reason when the host reports it unavailable via `GET /api/meta`)
- [x] 3.2 NewCheck: kind select next to the alert URL field
- [x] 3.3 Run panel: "alerted: slack ✓ · discord ✗" line from `alerts_sent`

## 4. Verify locally, then push

- [x] 4.1 Full suite green (count pasted from pytest)
- [x] 4.2 Production build compiles; channel card checked in Edge
- [x] 4.3 Commit; push; PRD, README and self-hosting doc updated (email env vars)
