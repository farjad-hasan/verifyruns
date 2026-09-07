## Why

Clients can miss alerts after interrupted delivery, receive a queued manual run that never completes, or have one password-reset link accepted twice concurrently. Postgres queries can also be mistaken for newest-first ordering. The client-readiness review reproduced these gaps; fix them before clients rely on the service.

## What Changes

- Persist notification transitions before delivery, retry interrupted/refused notifications from the scheduler, and serialize delivery per Check with recoverable leases.
- Atomically consume a still-valid reset token together with the password change.
- Persist manual runs before returning their IDs; resume interrupted work from the scheduler while preserving manual provenance.
- Require explicit top-level descending column ordering for Postgres newest-record assertions; ambiguous ordering fails as incomplete.
- Add regression coverage and update operator/product documentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `alerts`: durable transition delivery and recovery after interruption.
- `auth`: atomic one-time reset consumption.
- `webhook-wait`: durable manual execution.
- `verdict-engine`: validated newest-first Postgres ordering.

## Impact

Write boundary: `worker/src/{alerts,reset,routes,tick,checks,engine,connectors,execute}.ts`; new `worker/migrations/0007_client_readiness.sql`; `worker/test/{alerts,reset,runs,retention,concurrency,engine,postgres,hardening,client-readiness}.test.ts`; `frontend/src/pages/{CheckDetail,DataPage,SecurityPage,PrivacyPage}.jsx`; `README.md`, `PRODUCT.md`, `docs/{security,what-we-store,deploy,alpha-release,privacy}.md`; this change's OpenSpec artifacts and `openspec/CLAIMS.md`.

D1 migration must precede code deployment. No new service or dependency. Existing API response shapes remain compatible. Existing Checks with ambiguous Postgres ordering can become incomplete for newest-record assertions. Notifications are at-least-once: a crash after provider acceptance but before durable acknowledgement can duplicate delivery.
