## Context

`engine.ts` reads claims from `CLAIM_KEYS = [wrote, expected_new, count]` and evaluates growth as `delta < expected` where `expected = claimed ?? min_new_records`. Connectors mark `capped`/`count_estimated` but only annotate the message; the number still drives the verdict. `NewCheck.jsx` seeds `minNew = 1`.

## Goals / Non-Goals

**Goals:**
- No verdict is decided by a number the connector knows is wrong.
- No accidental claim capture from passthrough payloads.
- First run of a legitimate zero-growth workflow is a PASS.

**Non-Goals:**
- Removing the claim-of-0 reconciliation — `{"wrote": 0}` deliberately sent is the product working as designed.
- Raising the Airtable ceiling (subrequest budget); the fix is honest verdicts at the ceiling, not more pages.

## Decisions

- **Drop `count`, keep `wrote`/`expected_new`.** `wrote` is what every doc snippet teaches; `expected_new` is the explicit alias. Bare `count` was never in a published snippet, so breakage risk is ~zero; the body note ("webhook body key `count` is no longer read; send `wrote`") covers stragglers for one release.
- **Negative → absent + note**, mirroring the existing non-integer handling; `claimed` mode with a negative body FAILs with the teaching message, same as missing.
- **Uncertain counts skip growth, not the whole verdict.** Fingerprint carries `count_exact: false` when capped or estimated (either side of the comparison). The growth rule then contributes no reason and the message appends "Record-count checks were skipped: the count is capped/estimated." Field rules, non-empty rules and heartbeats are unaffected, so a capped Airtable Check still catches disappeared fields.
- **Baseline lookup**: the last-PASS fingerprint already stores `count_capped`/`count_estimated`; comparison reads them from the stored fingerprint, no migration needed.
- **Default 0 is frontend-only** — the API already accepts 0 as first-class ("growth optional") since claimed-count-reconciliation; only the seeded form value and helper text change.

## Risks / Trade-offs

- [Skipping growth on capped tables weakens detection for >4,000-row Airtable bases] → honest weakness beats a standing false alert; the note tells the user, and the Postgres/HTTP connectors keep exact counts.
- [Users who relied on accidental `count` capture] → none known; note-in-run for one release.
