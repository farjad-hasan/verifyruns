## Context

Cloudflare Workers plus D1 provide transactions but not an atomic transaction with alert providers. The current claim-before-send implementation can permanently mute undelivered alerts. Manual runs have no durable enqueue, reset tokens use a read/write race, and ordering is inferred from a regex.

## Goals / Non-Goals

Goals: recover work after interruption, consume reset links once under concurrency, and fail closed on ambiguous newest ordering. Preserve public API shapes and the sequential append-only product scope. Non-goals: billing, record reconciliation, enterprise auth, exactly-once external delivery.

## Decisions

1. Add an alert outbox with encrypted channel snapshots, ordered per Check, a renewable lease, attempts and next-attempt time. Persist the transition and outbox entry in the same transaction (together with the run where applicable). Drain immediately when possible and from the scheduler. Keep pending work on transport/database failure. One successful channel completes the event, preserving the existing partial-success contract. Persist channel results incrementally; only retry channels without durable acceptance. `last_alerted_verdict` becomes the last enqueued transition, not proof of delivery; `alerts_sent` remains the provider evidence. Per-Check ordering prevents recovery overtaking failure. Respect current snooze and removed channels before sending; delete jobs with their Check. Pending run history is protected from retention. A database outbox avoids a new external queue dependency.
2. After hashing, conditionally mark the still-unused, unexpired reset token consumed in a D1 batch; update the password and invalidate siblings only when that transaction's unique marker is present. A request-specific consumption marker guards follow-on statements. This avoids a separate destructive claim before hashing and ensures losers perform no mutation.
3. Append manual jobs to the existing durable run queue with a trigger field. Use per-Check renewable leases for overlapping immediate/scheduled drains. Remove an item only after its run exists. Older queued items without a trigger remain webhook runs.
4. Use a conservative SQL tokenizer to identify a top-level ORDER BY whose leading item is a column explicitly DESC. Ignore comments, quoted strings, dollar strings and nested expressions; quoted identifiers remain valid. Ambiguous ordering yields newest_defined=false. Apply the validated output-column order to the outer sample query so ordering is explicit there too. No general SQL parser dependency.

## Risks / Trade-offs

- Provider accepted before DB acknowledgement: a retry may duplicate a message; document at-least-once delivery.
- Refused providers: bounded retries with backoff; failures stay visible, other Checks continue.
- Existing pending claims lost before this migration cannot be reconstructed reliably; do not replay old incidents.
- Ambiguous Postgres ordering becomes incomplete; explain supported syntax.

## Migration Plan

Apply 0007 on staging before new code, run regression and smoke checks, then use the same sequence in production. Additive columns/table allow old code to load, but rolling code back stops outbox draining and must not be treated as an equivalent reliable release. No production deployment is part of this implementation task.
