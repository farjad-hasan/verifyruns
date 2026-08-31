## Context

`worker/src/alerts.ts:58-84` claims `last_alerted_verdict` with a predicated UPDATE, then delivers. The claim-first shape is correct for dedup (two concurrent FAIL runs must send one alert) but wrong for durability: delivery failure leaves the claim standing. `decryptSecret` (`crypto.ts:70-81`) catches everything and returns `""`; `deliver` treats an empty target as "no channel".

## Goals / Non-Goals

**Goals:**
- A FAIL streak whose alert never left the building alerts again on the next FAIL.
- Every delivery failure is observable: in `alerts_sent`, in logs, and in a counter.
- Exactly-once semantics are preserved for the success path.

**Non-Goals:**
- Per-channel retry queues or exponential backoff — the next FAIL run *is* the retry.
- Guaranteed delivery. At-least-once per streak, with visibility, is the bar.

## Decisions

- **Roll back, don't claim late.** Claiming *after* delivery reintroduces the duplicate-alert race the concurrency-guards change fixed. Instead: claim first (unchanged), deliver, and if `sent.every(s => !s.ok)` issue `UPDATE checks SET last_alerted_verdict = <prior> WHERE id = ? AND last_alerted_verdict = <claimed>`. If another run moved the state meanwhile, the rollback predicate fails and nothing is disturbed. Partial success (≥1 channel ok) keeps the claim — the user heard about the streak.
- **`decryptSecret` gains a sentinel.** It returns `null` on failure (distinct from `""` for legacy-empty); callers in `alerts.ts` record `{kind, ok: false, error: "decrypt"}` and `console.error` with the check id. Connector callers already surface fetch failures as FAIL runs; they treat `null` as "credential unreadable" and FAIL with a message naming re-entry as the fix, never silently fetching unauthenticated.
- **Counter lives in `meta`.** `alert_delivery_failures` incremented in the same batch as the run's `alerts_sent` write; exposed via `/api/health` in the `production-ops` change so the external probe pages on it.

## Risks / Trade-offs

- [Rollback + a flapping channel could alert twice for one streak] → acceptable: a duplicate alert is recoverable, a missing alert is not.
- [Decrypt-failure FAIL runs after an ENC_KEY mishap will page every affected user] → that is the correct behaviour; today they'd hear nothing.
