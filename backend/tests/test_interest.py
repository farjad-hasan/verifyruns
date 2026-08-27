"""openspec/changes/pricing-tiers (cheap version) + landing-page-sell — interest capture."""
import uuid
from pathlib import Path

import requests

API = "http://localhost:8000/api"


def _user():
    email = f"test_int_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    return email, {"Authorization": f"Bearer {r.json()['token']}"}


def test_interest_is_recorded_with_plan_and_email():
    email, h = _user()
    r = requests.post(f"{API}/interest", headers=h, json={"plan": "pro", "note": "need Postgres + heartbeat"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "plan": "pro"}
    from dotenv import dotenv_values
    from pymongo import MongoClient
    vals = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    doc = MongoClient(vals["MONGO_URL"])[vals["DB_NAME"]].interest.find_one({"email": email})
    assert doc and doc["plan"] == "pro" and doc["note"] == "need Postgres + heartbeat"


def test_interest_rejects_unknown_plan():
    _, h = _user()
    assert requests.post(f"{API}/interest", headers=h, json={"plan": "enterprise"}).status_code == 422


def test_interest_requires_login():
    assert requests.post(f"{API}/interest", json={"plan": "pro"}).status_code == 401


def test_plans_are_public():
    r = requests.get(f"{API}/plans")
    assert r.status_code == 200
    body = r.json()
    assert body["early_access"] is True
    assert [p["id"] for p in body["plans"]] == ["free", "pro", "agency"]
    assert all("planned_price" in p and "limits" in p for p in body["plans"])
