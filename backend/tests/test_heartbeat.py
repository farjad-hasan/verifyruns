"""openspec/changes/heartbeat-checks — pure + API tests.

The API tests drive `_heartbeat_tick(now=...)` in-process against the same
database the local server uses, so a 1-hour window can be tested in seconds.
"""
import asyncio
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_dev")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402
from server import _heartbeat_due, _heartbeat_message  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"

T0 = datetime(2026, 8, 27, 12, 0, tzinfo=timezone.utc)


def _iso(dt):
    return dt.isoformat()


# ---------- pure ----------

def test_not_due_inside_window():
    assert _heartbeat_due(24, _iso(T0), None, T0 + timedelta(hours=23)) is False


def test_due_after_window():
    assert _heartbeat_due(24, _iso(T0), None, T0 + timedelta(hours=25)) is True


def test_not_due_again_until_another_window_after_last_heartbeat():
    last_hb = _iso(T0 + timedelta(hours=25))
    assert _heartbeat_due(24, _iso(T0), last_hb, T0 + timedelta(hours=30)) is False
    assert _heartbeat_due(24, _iso(T0), last_hb, T0 + timedelta(hours=50)) is True


def test_off_when_unset():
    assert _heartbeat_due(None, _iso(T0), None, T0 + timedelta(days=30)) is False


def test_message_wording():
    assert _heartbeat_message(26.4, 24) == "No run in 26 h — expected one every 24 h."
    assert _heartbeat_message(1.6, 1) == "No run in 2 h — expected one every 1 h."


# ---------- API ----------

def _user():
    email = f"test_hb_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _runs(cid, h):
    return requests.get(f"{API}/checks/{cid}/runs", headers=h).json()


LOOP = asyncio.new_event_loop()  # one loop for the module: Motor binds to the first loop that uses it
_DB = {}


async def _database():
    """The same database the local API server uses — read from backend/.env, not from
    os.environ, because sibling test modules import `server` with their own DB_NAME."""
    if "db" not in _DB:
        from dotenv import dotenv_values
        from motor.motor_asyncio import AsyncIOMotorClient
        vals = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
        _DB["db"] = AsyncIOMotorClient(vals["MONGO_URL"])[vals["DB_NAME"]]
    return _DB["db"]


async def _tick_async(now):
    return await server._heartbeat_tick(now=now, database=await _database())


def _tick(now):
    LOOP.run_until_complete(_tick_async(now))


def test_heartbeat_hours_round_trips_and_validates():
    h = _user()
    r = requests.post(f"{API}/checks", headers=h, json={
        "name": "hb", "connector_kind": "http_json", "config": {"url": DEST_URL}, "heartbeat_hours": 24})
    assert r.status_code == 200, r.text
    assert r.json()["heartbeat_hours"] == 24
    cid = r.json()["id"]
    assert requests.patch(f"{API}/checks/{cid}", headers=h, json={"heartbeat_hours": None}).json()["heartbeat_hours"] is None
    for bad in (0, 1000):
        r = requests.post(f"{API}/checks", headers=h, json={
            "name": "bad", "connector_kind": "http_json", "config": {"url": DEST_URL}, "heartbeat_hours": bad})
        assert r.status_code == 422, r.text


def test_missed_window_produces_one_heartbeat_fail_then_recovers():
    h = _user()
    c = requests.post(f"{API}/checks", headers=h, json={
        "name": "silent-workflow", "connector_kind": "http_json", "config": {"url": DEST_URL},
        "expectations": {"min_new_records": 0}, "heartbeat_hours": 1}).json()
    cid = c["id"]

    later = datetime.now(timezone.utc) + timedelta(hours=2)
    _tick(later)
    runs = _runs(cid, h)
    assert len(runs) == 1
    assert runs[0]["trigger"] == "heartbeat" and runs[0]["verdict"] == "FAIL"
    assert runs[0]["diff_message"] == "No run in 2 h — expected one every 1 h."

    _tick(later)  # same window: no duplicate
    assert len(_runs(cid, h)) == 1

    _tick(later + timedelta(hours=2))  # another window: one more
    assert len(_runs(cid, h)) == 2

    # the workflow comes back
    requests.post(f"{API}/hook/{c['webhook_secret']}")
    deadline = time.time() + 20
    while time.time() < deadline and len(_runs(cid, h)) < 3:
        time.sleep(0.5)
    runs = _runs(cid, h)
    assert runs[0]["trigger"] == "webhook" and runs[0]["verdict"] == "PASS"

    # re-anchored on the real run: not due one minute later
    _tick(datetime.now(timezone.utc) + timedelta(minutes=1))
    assert len(_runs(cid, h)) == 3
