"""openspec/changes/deterministic-newest-record — pure-function + connector tests."""
import asyncio
import os
import sys
from pathlib import Path

import httpx
import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402
from server import _fingerprint, _compute_verdict, _fetch_records, _has_order_by, encrypt_secret  # noqa: E402


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _rows(emails):
    return [{"id": i, "email": e} for i, e in enumerate(emails)]


def _pass_run(n):
    return {"verdict": "PASS", "fingerprint": {"record_count": n, "sample_size": n, "fields": ["email", "id"],
                                               "newest_record": {"id": 0, "email": "x"}, "null_pct": {}}}


NON_EMPTY = {"min_new_records": 0, "required_fields": [], "non_empty_fields": ["email"], "growth_mode": "growth"}


# ---------- fingerprint ----------

def test_newest_is_first_record_and_window_is_first_five():
    fp = _fingerprint(_rows(["a", "b", "c", "d", "e", "f", "g"]))
    assert fp["newest_record"]["email"] == "a"
    assert [r["email"] for r in fp["newest_window"]] == ["a", "b", "c", "d", "e"]
    assert fp["newest_defined"] is True


def test_fingerprint_records_newest_undefined():
    fp = _fingerprint(_rows(["a"]), newest_defined=False)
    assert fp["newest_defined"] is False


# ---------- non-empty rule over the window ----------

def test_one_empty_outlier_in_newest_does_not_fail():
    fp = _fingerprint(_rows(["", "a", "b", "c", "d", "e"]))
    verdict, msg = _compute_verdict(fp, [_pass_run(6)], NON_EMPTY)
    assert verdict == "PASS", msg


def test_majority_empty_window_fails():
    fp = _fingerprint(_rows(["", "", "", "a", "b", "c"]))
    verdict, msg = _compute_verdict(fp, [_pass_run(6)], NON_EMPTY)
    assert verdict == "FAIL"
    assert "the field `email` is empty in 3 of the 5 newest records" in msg


def test_single_record_window_fails_when_empty():
    fp = _fingerprint(_rows([""]))
    verdict, msg = _compute_verdict(fp, [_pass_run(1)], NON_EMPTY)
    assert verdict == "FAIL"
    assert "the field `email` is empty in the newest record" in msg


def test_present_newest_but_majority_empty_still_passes():
    # the rule needs the newest record itself to be empty
    fp = _fingerprint(_rows(["a", "", "", "", "b"]))
    verdict, msg = _compute_verdict(fp, [_pass_run(5)], NON_EMPTY)
    assert verdict == "PASS", msg


def test_undefined_newest_skips_rule_with_note():
    fp = _fingerprint(_rows(["", "", ""]), newest_defined=False)
    verdict, msg = _compute_verdict(fp, [_pass_run(3)], NON_EMPTY)
    assert verdict == "PASS"
    assert msg.endswith("Newest-record checks were skipped: add ORDER BY <timestamp column> DESC to the query to enable them.")


def test_undefined_newest_without_non_empty_rule_adds_no_note():
    fp = _fingerprint(_rows(["", "", ""]), newest_defined=False)
    exp = {**NON_EMPTY, "non_empty_fields": []}
    verdict, msg = _compute_verdict(fp, [_pass_run(3)], exp)
    assert "skipped" not in msg


# ---------- Postgres ORDER BY detection (pure) ----------

@pytest.mark.parametrize("q,expected", [
    ("SELECT * FROM orders ORDER BY created_at DESC", True),
    ("select id from t order\n by ts", True),
    ("SELECT * FROM orders", False),
    ("SELECT * FROM (SELECT * FROM t ORDER BY x) s", True),
    ("SELECT border_by FROM t", False),
])
def test_has_order_by(q, expected):
    assert _has_order_by(q) is expected


# ---------- connectors deliver newest-first ----------

def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_airtable_sample_is_sorted_by_created_time_desc(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"records": [
            {"id": "r1", "createdTime": "2026-08-27T09:00:00.000Z", "fields": {"n": 1}},
            {"id": "r3", "createdTime": "2026-08-27T11:00:00.000Z", "fields": {"n": 3}},
            {"id": "r2", "createdTime": "2026-08-27T10:00:00.000Z", "fields": {"n": 2}},
        ]})
    monkeypatch.setattr(server, "_http_client", lambda: _client(handler))
    records, meta, err, _ = _run(_fetch_records("airtable", {"base_id": "b", "table": "t", "pat_encrypted": encrypt_secret("p")}))
    assert [r["n"] for r in records] == [3, 2, 1]
    assert meta["newest_defined"] is True


def test_http_json_orders_by_newest_key_desc(monkeypatch):
    def handler(request):
        return httpx.Response(200, json=[{"created_at": "2026-01-01", "v": 1}, {"created_at": "2026-03-01", "v": 3}, {"created_at": "2026-02-01", "v": 2}])
    monkeypatch.setattr(server, "_http_client", lambda: _client(handler))
    records, meta, err, _ = _run(_fetch_records("http_json", {"url": "https://x/", "newest_key": "created_at"}))
    assert [r["v"] for r in records] == [3, 2, 1]
    assert meta["newest_defined"] is True


def test_http_json_without_key_treats_last_element_as_newest(monkeypatch):
    def handler(request):
        return httpx.Response(200, json=[{"v": 1}, {"v": 2}, {"v": 3}])
    monkeypatch.setattr(server, "_http_client", lambda: _client(handler))
    records, meta, err, _ = _run(_fetch_records("http_json", {"url": "https://x/"}))
    assert records[0]["v"] == 3
    assert meta["newest_defined"] is True


PG_DSN = os.environ.get("VR_TEST_PG_DSN")
needs_pg = pytest.mark.skipif(not PG_DSN, reason="VR_TEST_PG_DSN not set")


@needs_pg
def test_postgres_without_order_by_is_undefined():
    cfg = {"dsn_encrypted": encrypt_secret(PG_DSN), "query": "SELECT g FROM generate_series(1, 10) g"}
    records, meta, err, _ = _run(_fetch_records("postgres", cfg))
    assert err is None
    assert meta["newest_defined"] is False


@needs_pg
def test_postgres_with_order_by_desc_puts_newest_first():
    cfg = {"dsn_encrypted": encrypt_secret(PG_DSN), "query": "SELECT g FROM generate_series(1, 10) g ORDER BY g DESC"}
    records, meta, err, _ = _run(_fetch_records("postgres", cfg))
    assert meta["newest_defined"] is True
    assert records[0]["g"] == 10
