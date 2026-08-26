## 1. Tests first

- [x] 1.1 Extend `backend/tests/test_verdict_engine.py`: claimed match, claimed mismatch, growth optional (0), steady changed, steady unchanged, claimed mode with no body
- [x] 1.2 Webhook route test: body `{"wrote": 3}` → run stores `claimed_new: 3`; body `{"wrote": "x"}` → `claimed_new: null` + note

## 2. Backend

- [x] 2.1 `Expectations` gains `growth_mode` (Literal) and `min_new_records: int = Field(ge=0, default=1)`
- [x] 2.2 `webhook()` parses JSON body tolerantly; passes `claimed_new` into `execute_check(..., claimed_new=None)`; retry passes the original value
- [x] 2.3 `_compute_verdict(fp, prev, expectations, claimed_new)` implements growth / steady / claimed with the new messages
- [x] 2.4 Run doc stores `claimed_new` and `body_note`

## 3. Frontend

- [x] 3.1 Expectations editor: growth mode select, min-new allows 0 with helper text
- [x] 3.2 Webhook card: second snippet with a JSON body (`{"wrote": {{ $json.count }}}` for n8n; Make/Zapier equivalents)
- [x] 3.3 Run panel shows "claimed N" when present

## 4. Verify locally, then push

- [x] 4.1 curl with `{"wrote": 3}` against an unchanged destination → FAIL "your workflow said it wrote 3 records; the destination gained 0" (pure + API tests)
- [x] 4.2 `min_new_records: 0` and no body → PASS (test_growth_optional_when_min_is_zero_and_no_claim)
- [x] 4.3 Full suite green (54 + new); production build compiles; editor + snippet checked in Edge
- [x] 4.4 Commit; push; update `memory/PRD.md`
