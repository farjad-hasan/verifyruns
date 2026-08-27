## Why

Slack is the only alert channel, and only because Emergent offers no email mechanism. Most solo n8n/Make operators live in email and Discord, not Slack; a watchdog they cannot hear is not one they will pay for. Discord is the same webhook shape as Slack (one afternoon); email needs a provider and therefore a host decision.

**Activation trigger:** Discord — immediately after the contest if credits allow. Email — on leaving Emergent (Resend/Postmark key as env).

## What Changes

- `alert_channels` becomes a list per Check: `{kind: slack|discord|email, target_encrypted}`.
- Discord: POST `{content}` to the webhook URL; same dedup/snooze/retry semantics.
- Email: Resend (or Postmark) transactional send; FAIL and Recovered templates; verified sender domain.
- Alert-sent badge on runs so users can see delivery happened.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `alerts`: "Slack only" requirement is replaced by multi-channel delivery.

## Impact

Check model migration (single Slack field → list; keep reading the old field), `_maybe_alert`, NewCheck/CheckDetail alert editor, env `RESEND_API_KEY`, `ALERT_FROM`.
