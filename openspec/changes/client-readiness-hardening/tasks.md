## 1. Fix client-readiness findings

- [x] 1.1 Implement atomic reset consumption and race regression tests.
- [x] 1.2 Persist notification transitions and implement leased retryable delivery, with interruption/concurrency/deletion tests.
- [x] 1.3 Persist manual runs with provenance and recoverable drain leases; test restart and concurrent drain behavior.
- [x] 1.4 Validate Postgres newest ordering and test misleading queries plus real Postgres sample ordering.

## 2. Verify locally, then push

- [x] 2.1 Update product/security/storage/deployment documentation for changed guarantees and migration.
- [x] 2.2 Run worker tests including Postgres when available, typecheck, frontend build and strict OpenSpec validation; review final diff.
- [ ] 2.3 Commit exact paths and publish the reviewed branch/PR without deploying main.
