## Why

Four paths emit a wrong verdict, and false verdicts destroy trust in a verification product faster than downtime:

1. Any webhook body with a top-level `count` key is read as a claim, and a claim of `0` or a negative **always passes** — a workflow that no-ops and forwards `{"count": 0}` from a previous node gets a green check. `count` is among the most common keys in generic n8n/Zapier payloads; capturing it was over-eager aliasing.
2. Airtable tables past the page ceiling saturate at 4,000, so two capped runs see delta 0 → false FAIL forever. The verdict-engine spec's own "Count plateau" scenario asserts this cannot happen; the code does not satisfy it.
3. A Postgres `COUNT(*)` timeout collapses `record_count` to the ≤100 sample length → huge negative delta → 3am false FAIL for exactly the slow databases people most want watched.
4. The New Check form defaults `min_new_records = 1` in growth mode — a manufactured FAIL on the first honest run of any workflow that doesn't always add rows.

Production-readiness review 2026-08-31: backend #5, #6, #9; frontend H2.

## What Changes

- Claim keys are `wrote` and `expected_new` only; bare `count` is no longer read. Negative claims are treated as absent with a body note. A claim of `0` remains a legitimate "nothing to sync" reconciliation.
- A fingerprint whose count is capped (`count_capped`) or estimated (`count_estimated`) — on this run **or** the baseline PASS — skips the growth rule with a note instead of deciding PASS/FAIL on a number known to be wrong. Field rules still run.
- New Check defaults: `min_new_records = 0`, with helper copy explaining what `1` asserts.

## Capabilities

### Modified Capabilities
- `verdict-engine`: claim-key tightening; capped/estimated counts do not decide growth.
- `checks`: creation defaults cannot manufacture a first-run FAIL.

## Impact

`worker/src/engine.ts` (CLAIM_KEYS, growth rule), `worker/src/connectors.ts` (propagate `count_capped`/`count_estimated` into the fingerprint), `worker/test/engine*.test.ts` (pure-function tests per openspec rules), `frontend/src/pages/NewCheck.jsx`, docs snippets that mention `count` as an alias (`docs/n8n.md`, `docs/make.md`, `docs/zapier.md`, landing SetupTabs).
