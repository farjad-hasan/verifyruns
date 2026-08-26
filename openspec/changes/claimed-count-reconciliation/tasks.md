## 1. Tests first

- [ ] 1.1 Extend `backend/tests/test_verdict_engine.py`: claimed match, claimed mismatch, growth optional (0), steady changed, steady unchanged, claimed mode with no body
- [ ] 1.2 Webhook route test: body `{"wrote": 3}` → run stores `claimed_new: 3`; body `{"wrote": "x"}` → `claimed_new: null` + note

## 2. Backend

- [ ] 2.1 `Expectations` gains `growth_mode` (Literal) and `min_new_records: int = Field(ge=0, default=1)`
- [ ] 2.2 `webhook()` parses JSON body tolerantly; passes `claimed_new` into `execute_check(..., claimed_new=None)`; retry passes the original value
- [ ] 2.3 `_compute_verdict(fp, prev, expectations, claimed_new)` implements growth / steady / claimed with the new messages
- [ ] 2.4 Run doc stores `claimed_new` and `body_note`

## 3. Frontend

- [ ] 3.1 Expectations editor: growth mode select, min-new allows 0 with helper text
- [ ] 3.2 Webhook card: second snippet with a JSON body (`{"wrote": {{ $json.count }}}` for n8n; Make/Zapier equivalents)
- [ ] 3.3 Run panel shows "claimed N" when present

## 4. Verify on Emergent preview, then publish

- [ ] 4.1 curl with `{"wrote": 2}` against an unchanged endpoint → FAIL with the mismatch message
- [ ] 4.2 Same with `min_new_records: 0` and no body → PASS
- [ ] 4.3 Publish; update `memory/PRD.md`
