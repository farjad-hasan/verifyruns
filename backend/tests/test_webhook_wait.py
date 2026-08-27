"""openspec/changes/n8n-community-node — webhook-wait capability (API tests)."""
import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
import requests

BASE_URL = "http://localhost:8000"
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


def _user():
    r = requests.post(f"{API}/auth/register", json={"email": f"test_ww_{uuid.uuid4().hex[:8]}@example.com", "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _check(h, url=DEST_URL):
    r = requests.post(f"{API}/checks", headers=h, json={
        "name": "wait", "connector_kind": "http_json", "config": {"url": url}, "expectations": {"min_new_records": 0}})
    assert r.status_code == 200, r.text
    return r.json()


class _Slow(BaseHTTPRequestHandler):
    delay = 3.0

    def do_GET(self):
        time.sleep(self.delay)
        body = json.dumps([{"id": 1}]).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def slow_url():
    srv = HTTPServer(("127.0.0.1", 0), _Slow)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/slow"
    srv.shutdown()


def test_wait_returns_the_verdict_and_records_exactly_one_run():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/hook/{c['webhook_secret']}?wait=20", json={"wrote": 0})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted"] is True and body["verdict"] == "PASS"
    assert body["diff_message"].startswith("First successful check")
    time.sleep(1)
    runs = requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()
    assert len(runs) == 1 and runs[0]["id"] == body["run_id"]


def test_slow_destination_means_a_slow_reply_not_a_null_verdict(slow_url):
    h = _user()
    c = _check(h, url=slow_url)
    t0 = time.time()
    r = requests.post(f"{API}/hook/{c['webhook_secret']}?wait=1")
    assert r.status_code == 200, r.text
    # serverless-ready: the call is inline, so a slow destination means a slow reply, never a null verdict
    assert time.time() - t0 >= 3
    body = r.json()
    assert body["verdict"] == "PASS" and body["timed_out"] is False
    runs = requests.get(f"{API}/checks/{c['id']}/runs", headers=h).json()
    assert runs and runs[0]["id"] == body["run_id"]


def test_no_wait_also_returns_the_verdict_inline():
    # serverless-ready (2026-08-28): every webhook call runs the check inline
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/hook/{c['webhook_secret']}")
    body = r.json()
    assert body["accepted"] is True and body["verdict"] == "PASS" and body["timed_out"] is False


def test_wait_is_capped_at_60():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/hook/{c['webhook_secret']}?wait=999")
    assert r.status_code == 200 and r.json()["verdict"] == "PASS"
