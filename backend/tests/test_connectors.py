"""Connector tests for openspec/changes/fix-record-cap-paging.

Airtable paging is verified against a fake paged API (httpx.MockTransport).
Postgres is verified end-to-end when VR_TEST_PG_DSN points at a database
(e.g. a local `docker run postgres:16`); otherwise those tests skip.
"""
import asyncio
import json
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
from server import _fetch_records, encrypt_secret  # noqa: E402


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ---------- Airtable ----------

def _paged_airtable(total, page=100):
    """Fake Airtable: 'records' pages of `page`, 'offset' present until exhausted."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        params = dict(request.url.params)
        start = int(params.get("offset", "0"))
        end = min(start + page, total)
        body = {"records": [
            {"id": f"rec{i}", "createdTime": "2026-08-27T00:00:00.000Z", "fields": {"n": i}}
            for i in range(start, end)
        ]}
        if end < total:
            body["offset"] = str(end)
        return httpx.Response(200, json=body)

    return handler, calls


def _airtable_client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=20.0)


AIRTABLE_CFG = {"base_id": "appX", "table": "Orders", "view": None, "pat_encrypted": encrypt_secret("pat")}


def test_airtable_follows_offset_until_exhausted(monkeypatch):
    handler, calls = _paged_airtable(250)
    monkeypatch.setattr(server, "_http_client", lambda: _airtable_client(handler))
    records, meta, err, details = _run(_fetch_records("airtable", AIRTABLE_CFG))
    assert err is None
    assert meta["total"] == 250
    assert len(records) == 100  # tick-latency-and-async: the sample is page one; later pages only count
    assert len(calls) == 3
    assert meta["capped"] is False


def test_airtable_stops_at_ceiling_and_flags_it(monkeypatch):
    handler, calls = _paged_airtable(1000)
    monkeypatch.setattr(server, "_http_client", lambda: _airtable_client(handler))
    monkeypatch.setattr(server, "AIRTABLE_MAX_RECORDS", 150)
    records, meta, err, details = _run(_fetch_records("airtable", AIRTABLE_CFG))
    assert err is None
    assert meta["total"] == 150
    assert meta["capped"] is True
    assert len(calls) == 2


def test_airtable_single_page_has_no_offset_param(monkeypatch):
    handler, calls = _paged_airtable(7)
    monkeypatch.setattr(server, "_http_client", lambda: _airtable_client(handler))
    records, meta, err, details = _run(_fetch_records("airtable", AIRTABLE_CFG))
    assert meta["total"] == 7
    assert "offset" not in dict(calls[0].url.params)
    assert dict(calls[0].url.params)["pageSize"] == "100"


# ---------- HTTP/JSON (regression: unchanged, total == len) ----------

def test_http_json_total_is_record_length(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"data": [{"i": i} for i in range(200)]})
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    records, meta, err, details = _run(_fetch_records("http_json", {"url": "https://x/api", "json_path": "data"}))
    assert err is None
    assert meta["total"] == 200 and len(records) == 200


# ---------- Postgres (real database, gated) ----------

PG_DSN = os.environ.get("VR_TEST_PG_DSN")
needs_pg = pytest.mark.skipif(not PG_DSN, reason="VR_TEST_PG_DSN not set")


@needs_pg
def test_postgres_count_is_true_total_and_sample_is_capped():
    cfg = {"dsn_encrypted": encrypt_secret(PG_DSN),
           "query": "SELECT g AS id, 'row' || g AS name FROM generate_series(1, 5000) g"}
    records, meta, err, details = _run(_fetch_records("postgres", cfg))
    assert err is None, (err, details)
    assert meta["total"] == 5000
    assert len(records) == 100
    assert meta["count_estimated"] is False


@needs_pg
def test_postgres_count_timeout_falls_back_to_sample_length(monkeypatch):
    monkeypatch.setattr(server, "PG_COUNT_TIMEOUT_MS", 50)
    cfg = {"dsn_encrypted": encrypt_secret(PG_DSN),
           "query": "SELECT g, pg_sleep(0.005) FROM generate_series(1, 100) g"}
    records, meta, err, details = _run(_fetch_records("postgres", cfg))
    assert err is None, (err, details)
    assert meta["count_estimated"] is True
    assert meta["total"] == len(records) == 100
