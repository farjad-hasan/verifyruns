"""openspec/changes/claimed-count-reconciliation — pure-function tests.

The workflow may tell VerifyRuns what it believes it wrote ({"wrote": N});
the verdict reconciles that claim against the destination's real growth.
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import _fingerprint, _compute_verdict, _parse_claimed  # noqa: E402


def _records(n):
    return [{"id": i, "name": f"row {i}"} for i in range(n)]


def _pass_run(record_count):
    return {"verdict": "PASS", "fingerprint": {
        "record_count": record_count, "sample_size": record_count,
        "fields": ["id", "name"], "newest_record": {"id": 1, "name": "x"},
        "null_pct": {"id": 0.0, "name": 0.0}}}


GROWTH = {"min_new_records": 1, "required_fields": [], "non_empty_fields": [], "growth_mode": "growth"}
STEADY = {**GROWTH, "growth_mode": "steady"}
CLAIMED = {**GROWTH, "growth_mode": "claimed"}


# ---------- parsing the webhook body ----------

def test_parse_claimed_accepts_wrote():
    assert _parse_claimed({"wrote": 3}) == (3, None)


def test_parse_claimed_accepts_aliases():
    assert _parse_claimed({"expected_new": 2}) == (2, None)
    assert _parse_claimed({"count": 5}) == (5, None)


def test_parse_claimed_ignores_non_integer_with_note():
    claimed, note = _parse_claimed({"wrote": "three"})
    assert claimed is None
    assert note == "webhook body ignored: `wrote` is not an integer"


def test_parse_claimed_empty_or_non_object_is_none():
    assert _parse_claimed(None) == (None, None)
    assert _parse_claimed([1, 2]) == (None, None)
    assert _parse_claimed({"other": 1}) == (None, None)


# ---------- growth mode with a claim ----------

def test_claimed_mismatch_fails_with_both_numbers():
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [_pass_run(40)], GROWTH, claimed_new=3)
    assert verdict == "FAIL"
    assert msg == "Run reported success, but your workflow said it wrote 3 records; the destination gained 0."


def test_claimed_match_passes_and_says_so():
    verdict, msg = _compute_verdict(_fingerprint(_records(43)), [_pass_run(40)], GROWTH, claimed_new=3)
    assert verdict == "PASS"
    assert msg == "Destination gained 3 record(s), matching what your workflow reported."


def test_claim_overrides_min_new_records_for_that_run():
    exp = {**GROWTH, "min_new_records": 5}
    verdict, msg = _compute_verdict(_fingerprint(_records(42)), [_pass_run(40)], exp, claimed_new=2)
    assert verdict == "PASS"


def test_growth_optional_when_min_is_zero_and_no_claim():
    exp = {**GROWTH, "min_new_records": 0}
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [_pass_run(40)], exp, claimed_new=None)
    assert verdict == "PASS"
    assert msg == "Destination gained 0 record(s). All expectations met."


def test_no_claim_keeps_todays_behaviour():
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [_pass_run(40)], GROWTH)
    assert verdict == "FAIL"
    assert msg == "Run reported success, but the destination gained 0 records (expected at least 1)."


# ---------- steady mode ----------

def test_steady_changed_fails():
    verdict, msg = _compute_verdict(_fingerprint(_records(11)), [_pass_run(12)], STEADY)
    assert verdict == "FAIL"
    assert msg == "Run reported success, but the destination changed by -1 records (expected no change)."


def test_steady_unchanged_passes():
    verdict, msg = _compute_verdict(_fingerprint(_records(12)), [_pass_run(12)], STEADY)
    assert verdict == "PASS"
    assert msg == "Destination unchanged at 12 records. All expectations met."


# ---------- claimed mode ----------

def test_claimed_mode_without_a_count_fails():
    verdict, msg = _compute_verdict(_fingerprint(_records(41)), [_pass_run(40)], CLAIMED, claimed_new=None)
    assert verdict == "FAIL"
    assert msg == ("Run reported success, but your workflow sent no record count "
                   "(this Check expects {\"wrote\": N} in the webhook body).")


def test_claimed_mode_with_matching_count_passes():
    verdict, msg = _compute_verdict(_fingerprint(_records(41)), [_pass_run(40)], CLAIMED, claimed_new=1)
    assert verdict == "PASS"
