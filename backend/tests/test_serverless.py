"""openspec/changes/serverless-ready — inline webhook, external tick, retry as data."""
import asyncio
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import server  # noqa: E402
from server import _tick  # noqa: E402

API = "http://localhost:8000/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


def _env():
    from dotenv import dotenv_values
    return dotenv_values(BACKEND / ".env")


LOOP = asyncio.new_event_loop()
_DB = {}


async def _database():
    if "db" not in _DB:
        from motor.motor_asyncio import AsyncIOMotorClient
        vals = _env()
        _DB["db"] = AsyncIOMotorClient(vals["MONGO_URL"])[vals["DB_NAME"]]
    return _DB["db"]


def _tick_at(now):
    async def go():
        return await _tick(now=now, database=await _database())
    return LOOP.run_until_complete(go())


def _user():
    r = requests.post(f"{API}/auth/register", json={"email": f"test_sl_{uuid.uuid4().hex[:8]}@example.com", "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _check(h, **extra):
    r = requests.post(f"{API}/checks", headers=h, json={"name": "sl", "connector_kind": "http_json", "config": {"url": DEST_URL}, **extra})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- inline webhook ----------

def test_webhook_returns_verdict_inline_and_run_exists_immediately():
    h = _user()
    c = _check(h, expectations={"min_new_records": 0})
    r = requests.post(f"{API}/hook/{c['webhook_secret']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["verdict"] == "PASS" and body["timed_out"] is False
    runs = requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()  # no polling
    assert [x["id"] for x in runs] == [body["run_id"]]


def test_wait_param_is_still_accepted():
    h = _user()
    c = _check(h, expectations={"min_new_records": 0})
    r = requests.post(f"{API}/hook/{c['webhook_secret']}?wait=30")
    assert r.status_code == 200 and r.json()["verdict"] == "PASS"


# ---------- tick endpoint ----------

def test_tick_requires_the_secret():
    assert requests.post(f"{API}/internal/tick").status_code == 401
    assert requests.post(f"{API}/internal/tick", headers={"X-Tick-Secret": "nope"}).status_code == 401


def test_tick_runs_with_the_secret():
    secret = _env().get("VR_TICK_SECRET")
    assert secret, "backend/.env needs VR_TICK_SECRET for this test"
    r = requests.post(f"{API}/internal/tick", headers={"X-Tick-Secret": secret})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) >= {"heartbeats", "retries"} and all(isinstance(body[k], int) for k in ("heartbeats", "retries"))


# ---------- retry as data ----------

def test_fresh_fail_records_pending_retry_and_the_tick_drains_it():
    h = _user()
    c = _check(h, expectations={"min_new_records": 1}, retry_before_alert=True)
    first = requests.post(f"{API}/hook/{c['webhook_secret']}").json()
    assert first["verdict"] == "PASS"  # first run: 200 records >= 1
    second = requests.post(f"{API}/hook/{c['webhook_secret']}", json={"wrote": 2}).json()
    assert second["verdict"] == "FAIL"

    check = requests.get(f"{API}/checks/{c['id']}", headers=h).json()
    assert check["pending_retry_at"], "fresh FAIL with retry_before_alert must schedule a retry"
    due = datetime.fromisoformat(check["pending_retry_at"])

    _tick_at(due - timedelta(seconds=5))
    assert len(requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()) == 2

    _tick_at(due + timedelta(seconds=1))
    runs = requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()
    assert len(runs) == 3
    assert runs[0]["trigger"] == "retry" and runs[0]["is_retry"] is True and runs[0]["claimed_new"] == 2
    assert requests.get(f"{API}/checks/{c['id']}", headers=h).json()["pending_retry_at"] is None

    _tick_at(due + timedelta(minutes=5))  # nothing pending: idempotent
    assert len(requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()) == 3
    requests.delete(f"{API}/checks/{c['id']}", headers=h)
