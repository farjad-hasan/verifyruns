## 1. Tests first (worker/test/)

- [x] 1.1 alerts: all channels fail → `last_alerted_verdict` restored; next FAIL claims and delivers again
- [x] 1.2 alerts: one of two channels fails → claim stands; `alerts_sent` records both outcomes
- [x] 1.3 alerts: concurrent FAIL runs with a failing channel → at most one delivery attempt per streak per claim (rollback predicate does not clobber a newer state)
- [x] 1.4 crypto: `decryptSecret` returns `null` (not `""`) on bad key / truncated ciphertext; legacy empty target still yields `""`
- [x] 1.5 alerts: undecryptable target → `{ok: false}` in `alerts_sent`, counter incremented, rollback fires
- [x] 1.6 alerts: 302 from the webhook URL → not followed, recorded as failure

## 2. Worker

- [x] 2.1 `crypto.ts`: `decryptSecret` returns `string | null`; audit every caller (`alerts.ts`, `connectors.ts`, `checks.ts` last4 path) for `null` handling — connectors FAIL the run with "Stored credential could not be read; re-enter it on the Check."
- [x] 2.2 `alerts.ts`: capture prior verdict before the claim; after delivery, if no channel ok, predicated rollback UPDATE; `redirect: "manual"` on channel fetches; cap error-body reads with the shared `readCapped` helper
- [x] 2.3 `meta.alert_delivery_failures` counter (INSERT OR REPLACE accumulate) written in the same batch as the run's `alerts_sent`

## 3. Docs

- [x] 3.1 `docs/security.md`: move "alert delivery is fire-and-forget" out of known gaps; describe the rollback + counter behaviour
- [x] 3.2 `docs/what-we-store.md`: note the counter (no targets, no bodies)

## 4. Verify locally, then push

- [x] 4.1 Full worker suite green including new tests; typecheck clean
- [ ] 4.2 Manual: check with a deliberately revoked Discord webhook → FAIL run shows the failed delivery in the run panel; second FAIL re-attempts
- [ ] 4.3 Commit; push; update `memory/PRD.md`
