"""API-level tests for claimed-count-reconciliation (run against a live local server)."""
import os
import time
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


def _user():
    email = f"test_claim_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _wait_runs(check_id, h, n, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        runs = requests.get(f"{API}/checks/{check_id}/runs", headers=h).json()
        if len(runs) >= n:
            return runs
        time.sleep(0.5)
    raise AssertionError(f"expected {n} runs")


def test_expectations_accept_growth_mode_and_zero_min():
    h = _user()
    r = requests.post(f"{API}/checks", headers=h, json={
        "name": "steady-table", "connector_kind": "http_json", "config": {"url": DEST_URL},
        "expectations": {"min_new_records": 0, "growth_mode": "steady"},
    })
    assert r.status_code == 200, r.text
    assert r.json()["expectations"]["growth_mode"] == "steady"
    assert r.json()["expectations"]["min_new_records"] == 0


def test_expectations_default_growth_mode():
    h = _user()
    r = requests.post(f"{API}/checks", headers=h, json={
        "name": "default", "connector_kind": "http_json", "config": {"url": DEST_URL}})
    assert r.json()["expectations"]["growth_mode"] == "growth"


def test_webhook_body_claim_is_stored_on_the_run():
    h = _user()
    c = requests.post(f"{API}/checks", headers=h, json={
        "name": "claim", "connector_kind": "http_json", "config": {"url": DEST_URL},
        "expectations": {"min_new_records": 0}}).json()
    r = requests.post(f"{API}/hook/{c['webhook_secret']}", json={"wrote": 3})
    assert r.status_code == 200
    run = _wait_runs(c["id"], h, 1)[0]
    assert run["claimed_new"] == 3
    assert run["verdict"] == "PASS"  # first run: 200 records >= claimed 3


def test_webhook_non_integer_claim_is_noted_not_fatal():
    h = _user()
    c = requests.post(f"{API}/checks", headers=h, json={
        "name": "bad-claim", "connector_kind": "http_json", "config": {"url": DEST_URL},
        "expectations": {"min_new_records": 0}}).json()
    requests.post(f"{API}/hook/{c['webhook_secret']}", json={"wrote": "lots"})
    run = _wait_runs(c["id"], h, 1)[0]
    assert run["claimed_new"] is None
    assert run["body_note"] == "webhook body ignored: `wrote` is not an integer"


def test_webhook_with_no_body_still_works():
    h = _user()
    c = requests.post(f"{API}/checks", headers=h, json={
        "name": "no-body", "connector_kind": "http_json", "config": {"url": DEST_URL}}).json()
    r = requests.post(f"{API}/hook/{c['webhook_secret']}")
    assert r.status_code == 200
    run = _wait_runs(c["id"], h, 1)[0]
    assert run["claimed_new"] is None and run.get("body_note") is None
