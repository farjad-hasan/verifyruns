## Why

A revoked Slack webhook, an expired Resend key, or a corrupted encrypted target silently mutes a Check forever. `maybeAlert` claims the `last_alerted_verdict` transition *before* delivering; if every channel then fails, the state says "alerted" and no later FAIL of the streak ever re-alerts. Worse, `decryptSecret` swallows every error and returns `""`, so a bad `ENC_KEY` or truncated ciphertext makes the channel loop skip the target with no log, no run annotation, nothing. The customer believes green means green — the worst possible failure for a product whose pitch is "we tell you when your automation lied".

Production-readiness review 2026-08-31: CRITICAL #1 (ops) / HIGH #8 (backend).

## What Changes

- The transition claim is kept (it is what makes two concurrent runs send one alert), but if **zero** channels deliver successfully, the claim is rolled back with a predicated UPDATE (only when the value is still what this caller wrote), so the next FAIL of the streak alerts again.
- A channel whose target fails to decrypt is a delivery *failure* (`{kind, ok: false, error: "decrypt"}` in `alerts_sent`), not a silent skip; the failure is logged with the check id.
- Failed deliveries increment `meta.alert_delivery_failures` (a counter the health endpoint will expose — wired in `production-ops`).
- Alert webhook fetches use `redirect: "manual"`, closing the egress-policy gap where a user-supplied alert URL 302s somewhere the save-time check never saw.
- Alert error-response bodies are read with the same size cap as connector reads, not `resp.text()` unbounded.

## Capabilities

### Modified Capabilities
- `alerts`: transition claim rolls back on total delivery failure; decrypt failures are visible failures; no redirects on delivery.

## Impact

`worker/src/alerts.ts`, `worker/src/crypto.ts` (decrypt returns a distinguishable failure), `worker/src/execute.ts` (alerts_sent shape), `worker/test/alerts*.test.ts`; `docs/security.md` known-gaps table.
