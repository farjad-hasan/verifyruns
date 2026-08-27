"""openspec/changes/data-minimisation — pure + API tests."""
import asyncio
import hashlib
import json
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
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import _canonical_hash, _split_sample, _fingerprint, SAMPLE_TTL_DAYS  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


# ---------- pure ----------

def test_canonical_hash_ignores_key_order():
    assert _canonical_hash({"a": 1, "b": [1, 2]}) == _canonical_hash({"b": [1, 2], "a": 1})
    assert _canonical_hash({"a": 1}) == hashlib.sha256(json.dumps({"a": 1}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def test_split_sample_default_strips_rows():
    fp = _fingerprint([{"id": 1, "email": "a@b.c"}, {"id": 2, "email": ""}])
    stored, sample = _split_sample(fp, "upstream body", store_samples=False)
    assert "newest_record" not in stored and "newest_window" not in stored
    assert stored["newest_hash"] == _canonical_hash({"id": 1, "email": "a@b.c"})
    assert stored["sample_stored"] is False
    assert stored["record_count"] == 2 and stored["fields"] == ["email", "id"]
    assert sample is None


def test_split_sample_opt_in_keeps_rows_with_expiry():
    fp = _fingerprint([{"id": 1}])
    before = datetime.now(timezone.utc)
    stored, sample = _split_sample(fp, "upstream body", store_samples=True)
    assert stored["sample_stored"] is True and "newest_record" not in stored
    assert sample["newest_record"] == {"id": 1} and sample["newest_window"] == [{"id": 1}]
    assert sample["error_details"] == "upstream body"
    expires = datetime.fromisoformat(sample["expires_at"])
    assert timedelta(days=SAMPLE_TTL_DAYS - 1) < expires - before < timedelta(days=SAMPLE_TTL_DAYS + 1)


def test_split_sample_handles_empty_fingerprint():
    fp = {"record_count": 0, "sample_size": 0, "fields": [], "newest_record": None, "newest_window": [], "newest_defined": True, "null_pct": {}}
    stored, sample = _split_sample(fp, None, store_samples=False)
    assert stored["newest_hash"] is None and sample is None


# ---------- API ----------

def _user():
    email = f"test_dm_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _check(h, url=DEST_URL, **extra):
    r = requests.post(f"{API}/checks", headers=h, json={"name": "dm", "connector_kind": "http_json", "config": {"url": url}, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def _first_run(cid, h):
    requests.post(f"{API}/checks/{cid}/run", headers=h)
    deadline = time.time() + 20
    while time.time() < deadline:
        runs = requests.get(f"{API}/checks/{cid}/runs", headers=h).json()
        if runs:
            return requests.get(f"{API}/runs/{runs[0]['id']}", headers=h).json()
        time.sleep(0.5)
    raise AssertionError("no run")


def test_default_run_stores_hash_not_rows():
    h = _user()
    c = _check(h)
    assert c["store_samples"] is False
    run = _first_run(c["id"], h)
    fp = run["fingerprint"]
    assert "newest_record" not in fp and "newest_window" not in fp
    assert isinstance(fp["newest_hash"], str) and len(fp["newest_hash"]) == 64
    assert fp["sample_stored"] is False and "sample" not in run


def test_default_run_drops_error_body():
    h = _user()
    c = _check(h, url="https://jsonplaceholder.typicode.com/nope-404")
    run = _first_run(c["id"], h)
    assert run["verdict"] == "FAIL" and "HTTP 404" in run["diff_message"]
    assert run["error_details"] is None


def test_opt_in_run_keeps_sample_with_expiry():
    h = _user()
    c = _check(h, store_samples=True)
    assert c["store_samples"] is True
    run = _first_run(c["id"], h)
    assert run["fingerprint"]["sample_stored"] is True
    sample = run["sample"]
    assert isinstance(sample["newest_record"], dict) and len(sample["newest_window"]) == 5
    expires = datetime.fromisoformat(sample["expires_at"])
    assert expires > datetime.now(timezone.utc) + timedelta(days=SAMPLE_TTL_DAYS - 1)


def test_store_samples_toggle_via_patch():
    h = _user()
    c = _check(h)
    assert requests.patch(f"{API}/checks/{c['id']}", headers=h, json={"store_samples": True}).json()["store_samples"] is True


def test_run_samples_has_ttl_index():
    from dotenv import dotenv_values
    from pymongo import MongoClient
    vals = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    info = MongoClient(vals["MONGO_URL"])[vals["DB_NAME"]].run_samples.index_information()
    ttl = [i for i in info.values() if i.get("key") == [("expires_at", 1)]]
    assert ttl and ttl[0].get("expireAfterSeconds") == 0


def test_delete_account_removes_everything():
    h = _user()
    c = _check(h, store_samples=True)
    _first_run(c["id"], h)
    assert requests.delete(f"{API}/auth/me", headers=h).status_code == 200
    assert requests.get(f"{API}/auth/me", headers=h).status_code == 401
    from dotenv import dotenv_values
    from pymongo import MongoClient
    vals = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    db = MongoClient(vals["MONGO_URL"])[vals["DB_NAME"]]
    assert db.checks.count_documents({"id": c["id"]}) == 0
    assert db.check_runs.count_documents({"check_id": c["id"]}) == 0
    assert db.run_samples.count_documents({"check_id": c["id"]}) == 0
