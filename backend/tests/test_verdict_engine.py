"""Pure-function tests for the fingerprint + verdict engine (no HTTP, no DB).

Covers openspec/specs/verdict-engine and the deltas in
openspec/changes/fix-record-cap-paging.
"""
import os
import sys
from pathlib import Path

# server.py reads these at import; default them so the tests never depend on .env
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import _fingerprint, _compute_verdict  # noqa: E402


def _records(n, **extra):
    return [{"id": i, "name": f"row {i}", **extra} for i in range(n)]


def _pass_run(record_count, fields=("id", "name"), sample_size=None):
    return {
        "verdict": "PASS",
        "fingerprint": {
            "record_count": record_count,
            "sample_size": sample_size if sample_size is not None else record_count,
            "fields": sorted(fields),
            "newest_record": {f: "x" for f in fields},
            "null_pct": {f: 0.0 for f in fields},
        },
    }


DEFAULTS = {"min_new_records": 1, "required_fields": [], "non_empty_fields": []}


# ---------- fingerprint ----------

def test_fingerprint_defaults_total_to_sample_length():
    fp = _fingerprint(_records(3))
    assert fp["record_count"] == 3
    assert fp["sample_size"] == 3


def test_fingerprint_record_count_is_total_not_sample():
    fp = _fingerprint(_records(100), total=2403)
    assert fp["record_count"] == 2403
    assert fp["sample_size"] == 100


def test_fingerprint_fields_and_null_pct():
    fp = _fingerprint([{"a": 1, "b": ""}, {"a": 2}])
    assert fp["fields"] == ["a", "b"]
    assert fp["null_pct"] == {"a": 0.0, "b": 100.0}
    assert fp["newest_record"] == {"a": 2}


# ---------- verdict: growth rule ----------

def test_first_run_passes_with_first_success_message():
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [], DEFAULTS)
    assert verdict == "PASS"
    assert msg == "First successful check. Destination has 40 records across 2 fields."


def test_noop_run_fails_with_gained_zero():
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [_pass_run(40)], DEFAULTS)
    assert verdict == "FAIL"
    assert msg == "Run reported success, but the destination gained 0 records (expected at least 1)."


def test_growth_passes():
    verdict, msg = _compute_verdict(_fingerprint(_records(43)), [_pass_run(40)], DEFAULTS)
    assert verdict == "PASS"
    assert msg == "Destination gained 3 record(s). All expectations met."


def test_large_table_growth_passes_when_count_is_true_total():
    # 2,400 -> 2,403 rows with a 100-row sample must PASS: the count is the total, not the sample
    fp = _fingerprint(_records(100), total=2403)
    prev = [_pass_run(2400, sample_size=100)]
    verdict, msg = _compute_verdict(fp, prev, DEFAULTS)
    assert verdict == "PASS"
    assert msg == "Destination gained 3 record(s). All expectations met."


# ---------- verdict: field rules ----------

def test_required_field_missing_is_named():
    exp = {**DEFAULTS, "required_fields": ["price"]}
    verdict, msg = _compute_verdict(_fingerprint(_records(41)), [_pass_run(40)], exp)
    assert verdict == "FAIL"
    assert "the field `price` is missing" in msg


def test_disappeared_field_names_the_window():
    prev = [_pass_run(40 + i, fields=("id", "name", "sku")) for i in range(3)]
    verdict, msg = _compute_verdict(_fingerprint(_records(50)), prev, DEFAULTS)
    assert verdict == "FAIL"
    assert "the field `sku` disappeared — it was present in the last 3 good runs" in msg


def test_non_empty_rule_checks_newest_record():
    exp = {**DEFAULTS, "non_empty_fields": ["email"]}
    records = _records(41, email="a@b.c")
    records[-1]["email"] = ""
    verdict, msg = _compute_verdict(_fingerprint(records), [_pass_run(40)], exp)
    assert verdict == "FAIL"
    assert "the field `email` is empty in the newest record" in msg


def test_two_reasons_are_joined_with_and():
    exp = {**DEFAULTS, "required_fields": ["price"]}
    verdict, msg = _compute_verdict(_fingerprint(_records(40)), [_pass_run(40)], exp)
    assert verdict == "FAIL"
    assert msg == (
        "Run reported success, but the destination gained 0 records (expected at least 1) "
        "and the field `price` is missing."
    )
