## 1. Tests first (worker/test/ — pure-function engine tests per openspec rules)

- [x] 1.1 engine: body `{"count": 0}` → no claim, growth rule applies, ignored-key note stored
- [x] 1.2 engine: `{"wrote": 0}` unchanged destination → PASS reconciliation; `{"wrote": -2}` → treated as absent + note; `claimed` mode with negative body → FAIL teaching message
- [x] 1.3 engine: `count_capped` on this run / on the baseline / on both → growth skipped with note; field rules still fire (disappeared field on a capped run FAILs)
- [x] 1.4 engine: `count_estimated` baseline 5,000,000 vs sample-collapsed 100 → no growth FAIL, note present
- [x] 1.5 connectors: capped Airtable fetch propagates `count_capped` into the fingerprint (stub 41 pages)

## 2. Worker

- [x] 2.1 `engine.ts`: `CLAIM_KEYS = ["wrote", "expected_new"]`; negative clamp; `count_exact` derivation from `count_capped || count_estimated` on either fingerprint; skip-note wording
- [x] 2.2 `connectors.ts`: write `count_capped` / `count_estimated` into the fingerprint object (not only the message annotation)
- [x] 2.3 run body note for ignored `count` key (one-release migration aid)

## 3. Frontend + docs

- [x] 3.1 `NewCheck.jsx`: `minNew` default 0; helper text under the field ("0 = growth optional; 1 asserts every run adds a record")
- [x] 3.2 sweep `count` as a claim alias out of `docs/n8n.md`, `docs/make.md`, `docs/zapier.md`, landing `SetupTabs`, and the in-app webhook card hint
- [x] 3.3 run panel: render the skipped-growth note distinctly (reuse the existing note styling)

## 4. Verify locally, then push

- [x] 4.1 Full suite green; typecheck clean
- [x] 4.2 Manual: Airtable base >4,100 rows (or stub) → PASS with skip note, then delete a field → FAIL on the field rule
- [ ] 4.3 Commit; push; update `memory/PRD.md`
