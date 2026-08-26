## Why

A nightly sync that legitimately has nothing to sync writes 0 rows and gets a FAIL, because `min_new_records` defaults to 1 and the webhook body is ignored. Meanwhile the strongest check the product could make — "your workflow says it wrote 3, did the destination gain 3?" — is not made at all. Letting the workflow send what it believes it wrote turns a growth heuristic into a reconciliation, which is the literal "green but wrong" detection no incumbent offers.

## What Changes

- Webhook accepts an optional JSON body `{"wrote": <int>}` (aliases `expected_new`, `count`); when present, the run's expected growth is that number instead of `min_new_records`.
- `min_new_records = 0` is a first-class setting: "growth optional; only field rules apply".
- New per-Check `growth_mode`: `growth` (default, current behaviour), `steady` (count must not change), `claimed` (webhook body required; missing body FAILs with a teaching message).
- Diff message for a claimed mismatch: "Your workflow said it wrote 3 records; the destination gained 0."
- Landing/onboarding snippet shows the n8n/Make/Zapier body with `{{ $json.count }}`.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `checks`: webhook body is parsed; expectations gain `growth_mode`.
- `verdict-engine`: growth rule reconciles against the claimed count when supplied; `steady` mode.

## Impact

`backend/server.py` webhook route, `CheckCreate`/`Expectations` models, `execute_check` signature (carry `claimed`), `_compute_verdict`; `NewCheck.jsx` and `CheckDetail.jsx` expectations editor; landing "how it works" step 2 copy; tests in `backend/tests/test_verdict_engine.py`.
