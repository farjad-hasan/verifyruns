## Context

Alerting is one Fernet-encrypted Slack URL per Check (`alert_slack_webhook_encrypted`) and one delivery path in `_maybe_alert`. State-based dedup (`last_alerted_verdict`), retry-before-alert and snooze all live above the delivery call and are channel-agnostic already.

## Goals / Non-Goals

**Goals:**
- Several channels per Check: Slack, Discord, email. Same transition semantics for all.
- Existing Checks keep working with no migration: the legacy Slack field is read as one channel.
- Email is real or absent — never silently dropped: without `RESEND_API_KEY` the host refuses to create an email channel and says why.
- Users can see that an alert actually went out (per-run `alerts_sent`).

**Non-Goals:**
- Per-channel routing rules (FAIL to Slack, Recovered to email). All channels get all transitions.
- Verified sender domains, templates, digests.
- SMS / PagerDuty.

## Decisions

- **`alert_channels: [{id, kind, target_encrypted, created_at}]` on the Check, plus legacy read.** `_channels(check)` returns the legacy Slack URL (id `legacy-slack`) followed by the list. Deleting `legacy-slack` unsets the old field. Alternative: migrate on startup — more moving parts for zero user benefit.
- **Channel endpoints, not a giant PATCH:** `POST /api/checks/{id}/channels {kind, target}` → sanitised channel; `DELETE /api/checks/{id}/channels/{channel_id}`. `CheckCreate` also accepts `alert_channels` so the new-check form can add one up front. The old `alert_slack_webhook` inputs keep working.
- **Delivery is one function per kind, all through `_http_client()`** so tests can assert the exact request: Slack `{text}`, Discord `{content}` (2,000-char cap applied), email = Resend `POST https://api.resend.com/emails` with `from: ALERT_FROM`, `to: [target]`, `subject`, `text`.
- **Email gated at creation time:** `RESEND_API_KEY` and `ALERT_FROM` must both be set or `POST /channels {kind: "email"}` returns 400 "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)." Rationale: a channel that can never deliver is worse than no channel.
- **`alerts_sent` on the run:** list of `{kind, ok}` after delivery attempts, written with `$set` after the attempts. The run panel shows "alerted: slack ✓, discord ✗".
- **Dedup stays per Check, not per channel.** One transition → one attempt on every channel. A channel that fails delivery is logged and marked `ok: false`; it does not block the others or re-arm the state.

## Risks / Trade-offs

- [Discord rate limits on noisy Checks] → transitions only, never per run; fine.
- [Resend rejects unverified `ALERT_FROM`] → surfaces as `ok: false` on the run and in the log; documented in self-hosting.
- [Legacy + list both hold a Slack URL] → both fire; the UI shows both rows so the duplicate is visible and deletable.
