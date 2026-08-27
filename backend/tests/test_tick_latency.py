"""openspec/changes/tick-latency-and-async — lazy tick, queued webhook, fast Airtable count."""
import asyncio
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import requests

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import server  # noqa: E402
from server import _fetch_records, _tick, encrypt_secret  # noqa: E402

API = "http://localhost:8000/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"

LOOP = asyncio.new_event_loop()
_DB = {}


def _env():
    from dotenv import dotenv_values
    return dotenv_values(BACKEND / ".env")


async def _database():
    if "db" not in _DB:
        from motor.motor_asyncio import AsyncIOMotorClient
        vals = _env()
        _DB["db"] = AsyncIOMotorClient(vals["MONGO_URL"])[vals["DB_NAME"]]
    return _DB["db"]


def _sync_db():
    from pymongo import MongoClient
    vals = _env()
    return MongoClient(vals["MONGO_URL"])[vals["DB_NAME"]]


def _tick_now():
    async def go():
        return await _tick(database=await _database())
    return LOOP.run_until_complete(go())


def _user():
    r = requests.post(f"{API}/auth/register", json={"email": f"test_tl_{uuid.uuid4().hex[:8]}@example.com", "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _check(h, **extra):
    r = requests.post(f"{API}/checks", headers=h, json={"name": "tl", "connector_kind": "http_json", "config": {"url": DEST_URL},
                                                         "expectations": {"min_new_records": 0}, **extra})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- lazy tick on traffic ----------

def test_traffic_claims_and_runs_the_tick_once_per_window():
    db = _sync_db()
    stale = datetime.now(timezone.utc) - timedelta(minutes=2)
    db.meta.update_one({"_id": "tick"}, {"$set": {"last_at": stale.isoformat()}}, upsert=True)
    h = _user()  # the registration request itself is traffic
    time.sleep(1.5)  # the tick runs after the response
    first = db.meta.find_one({"_id": "tick"})["last_at"]
    assert datetime.fromisoformat(first) > stale + timedelta(seconds=90)
    requests.get(f"{API}/auth/me", headers=h)
    time.sleep(0.5)
    assert db.meta.find_one({"_id": "tick"})["last_at"] == first  # inside the window: no second claim


def test_scheduler_tick_stamps_the_same_timestamp():
    db = _sync_db()
    before = datetime.now(timezone.utc)
    r = requests.post(f"{API}/internal/tick", headers={"X-Tick-Secret": _env()["VR_TICK_SECRET"]})
    assert r.status_code == 200
    assert datetime.fromisoformat(db.meta.find_one({"_id": "tick"})["last_at"]) >= before - timedelta(seconds=1)


# ---------- queued webhook ----------

def test_wait_zero_queues_and_the_tick_drains_once():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/hook/{c['webhook_secret']}?wait=0", json={"wrote": 0})
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["queued"] is True and body["run_id"]
    assert requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json() == []
    assert requests.get(f"{API}/checks/{c['id']}", headers=h).json()["pending_runs"] == 1

    _tick_now()
    runs = requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()
    assert [x["id"] for x in runs] == [body["run_id"]]
    assert runs[0]["trigger"] == "webhook" and runs[0]["verdict"] == "PASS" and runs[0]["claimed_new"] == 0

    _tick_now()
    assert len(requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()) == 1
    requests.delete(f"{API}/checks/{c['id']}", headers=h)


def test_default_webhook_is_still_inline():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/hook/{c['webhook_secret']}")
    assert r.status_code == 200 and r.json()["verdict"] == "PASS"


# ---------- Airtable: cheap paging, newest across pages ----------

def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _airtable(total, newest_index):
    """Fake base: record i created at 2026-08-01 + i minutes, except `newest_index` which is the newest."""
    calls = []

    def created(i):
        if i == newest_index:
            return "2026-12-31T00:00:00.000Z"
        return f"2026-08-01T00:{i // 60:02d}:{i % 60:02d}.000Z"

    def handler(request):
        calls.append(request)
        path = request.url.path
        if path.count("/") >= 4 and path.rsplit("/", 1)[-1].startswith("rec") and "offset" not in dict(request.url.params):
            i = int(path.rsplit("rec", 1)[-1])
            return httpx.Response(200, json={"id": f"rec{i}", "createdTime": created(i), "fields": {"n": i, "name": f"row {i}"}})
        params = request.url.params
        start = int(params.get("offset", "0"))
        end = min(start + 100, total)
        only = params.get_list("fields[]")
        recs = []
        for i in range(start, end):
            fields = {"n": i, "name": f"row {i}"}
            if only:
                fields = {k: v for k, v in fields.items() if k in only}
            recs.append({"id": f"rec{i}", "createdTime": created(i), "fields": fields})
        body = {"records": recs}
        if end < total:
            body["offset"] = str(end)
        return httpx.Response(200, json=body)

    return handler, calls


CFG = {"base_id": "appX", "table": "Orders", "view": None, "pat_encrypted": encrypt_secret("pat")}


def test_later_pages_request_one_field_and_count_is_exact(monkeypatch):
    handler, calls = _airtable(250, newest_index=5)
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    records, meta, err, _ = _run(_fetch_records("airtable", CFG))
    assert err is None and meta["total"] == 250
    pages = [c for c in calls if "offset" in dict(c.url.params)]
    assert len(pages) == 2 and all(c.url.params.get_list("fields[]") == ["n"] for c in pages)
    assert "fields[]" not in dict(calls[0].url.params)
    assert len(records) == 100 and records[0]["n"] == 5  # newest is on page one; sample is page one


def test_newest_on_a_later_page_is_fetched_by_id(monkeypatch):
    handler, calls = _airtable(250, newest_index=230)
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    records, meta, err, _ = _run(_fetch_records("airtable", CFG))
    assert err is None and meta["total"] == 250
    assert records[0]["n"] == 230 and records[0]["name"] == "row 230"
    assert len(records) == 101
    single = [c for c in calls if c.url.path.endswith("/rec230")]
    assert len(single) == 1


def test_single_page_base_makes_no_extra_requests(monkeypatch):
    handler, calls = _airtable(7, newest_index=3)
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    records, meta, err, _ = _run(_fetch_records("airtable", CFG))
    assert meta["total"] == 7 and len(calls) == 1 and records[0]["n"] == 3
