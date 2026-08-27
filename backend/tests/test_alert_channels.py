"""openspec/changes/email-and-discord-alerts — pure, mock-transport, API and end-to-end tests."""
import asyncio
import json
import os
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import pytest
import requests

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server  # noqa: E402
from server import _channels, _deliver, encrypt_secret  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ---------- pure ----------

def test_channels_merges_legacy_slack_and_list():
    check = {
        "alert_slack_webhook_encrypted": encrypt_secret("https://hooks.slack.com/services/T/B/legacy"),
        "alert_channels": [{"id": "c1", "kind": "discord", "target_encrypted": encrypt_secret("https://discord.com/api/webhooks/1/abcd")}],
    }
    chans = _channels(check)
    assert [(c["id"], c["kind"]) for c in chans] == [("legacy-slack", "slack"), ("c1", "discord")]
    assert chans[0]["target"].endswith("/legacy") and chans[1]["target"].endswith("/abcd")


def test_channels_empty_when_none_configured():
    assert _channels({}) == []


# ---------- delivery through a mock transport ----------

def _capture(monkeypatch, status=200):
    seen = []

    def handler(request):
        seen.append((str(request.url), request.headers, json.loads(request.content or b"{}")))
        return httpx.Response(status, json={"ok": True})
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return seen


def test_deliver_slack_posts_text(monkeypatch):
    seen = _capture(monkeypatch)
    ok = _run(_deliver("slack", "https://hooks.slack.com/services/x", "hello", subject="s"))
    assert ok is True
    assert seen[0][0] == "https://hooks.slack.com/services/x" and seen[0][2] == {"text": "hello"}


def test_deliver_discord_posts_content_capped(monkeypatch):
    seen = _capture(monkeypatch)
    ok = _run(_deliver("discord", "https://discord.com/api/webhooks/1/x", "y" * 2500, subject="s"))
    assert ok is True
    assert set(seen[0][2]) == {"content"} and len(seen[0][2]["content"]) == 2000


def test_deliver_email_posts_to_resend(monkeypatch):
    seen = _capture(monkeypatch)
    monkeypatch.setattr(server, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(server, "ALERT_FROM", "VerifyRuns <alerts@example.com>")
    ok = _run(_deliver("email", "ops@example.com", "body text", subject="FAIL — orders"))
    assert ok is True
    url, headers, body = seen[0]
    assert url == "https://api.resend.com/emails"
    assert headers["authorization"] == "Bearer re_test"
    assert body == {"from": "VerifyRuns <alerts@example.com>", "to": ["ops@example.com"], "subject": "FAIL — orders", "text": "body text"}


def test_deliver_reports_failure(monkeypatch):
    _capture(monkeypatch, status=500)
    assert _run(_deliver("discord", "https://discord.com/api/webhooks/1/x", "hi", subject="s")) is False


# ---------- API ----------

def _user():
    email = f"test_ch_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _check(h, **extra):
    body = {"name": "chan", "connector_kind": "http_json", "config": {"url": DEST_URL}, **extra}
    r = requests.post(f"{API}/checks", headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_meta_reports_email_availability():
    r = requests.get(f"{API}/meta")
    assert r.status_code == 200
    assert r.json()["email_alerts"] is False  # local host has no RESEND_API_KEY


def test_add_list_delete_discord_channel():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/checks/{c['id']}/channels", headers=h, json={"kind": "discord", "target": "https://discord.com/api/webhooks/1/abcd"})
    assert r.status_code == 200, r.text
    ch = r.json()
    assert ch["kind"] == "discord" and ch["last4"].endswith("abcd") and "target" not in ch
    listed = requests.get(f"{API}/checks/{c['id']}", headers=h).json()["alert_channels"]
    assert [x["id"] for x in listed] == [ch["id"]]
    assert requests.delete(f"{API}/checks/{c['id']}/channels/{ch['id']}", headers=h).status_code == 200
    assert requests.get(f"{API}/checks/{c['id']}", headers=h).json()["alert_channels"] == []


def test_email_channel_refused_without_sender_config():
    h = _user()
    c = _check(h)
    r = requests.post(f"{API}/checks/{c['id']}/channels", headers=h, json={"kind": "email", "target": "ops@example.com"})
    assert r.status_code == 400
    assert r.json()["detail"] == "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)."


def test_legacy_slack_is_listed_and_removable():
    h = _user()
    c = _check(h, alert_slack_webhook="https://hooks.slack.com/services/T/B/wxyz")
    listed = c["alert_channels"]
    assert listed == [{"id": "legacy-slack", "kind": "slack", "last4": "••••••••wxyz"}]
    assert requests.delete(f"{API}/checks/{c['id']}/channels/legacy-slack", headers=h).status_code == 200
    after = requests.get(f"{API}/checks/{c['id']}", headers=h).json()
    assert after["alert_channels"] == [] and after["has_alert_slack"] is False


def test_create_accepts_alert_channels():
    h = _user()
    c = _check(h, alert_channels=[{"kind": "discord", "target": "https://discord.com/api/webhooks/1/qqqq"}])
    assert [x["kind"] for x in c["alert_channels"]] == ["discord"]


# ---------- end-to-end: a local catcher receives the Discord alert ----------

class _Catcher(BaseHTTPRequestHandler):
    received = []

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        _Catcher.received.append(json.loads(self.rfile.read(n)))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def catcher_url():
    srv = HTTPServer(("127.0.0.1", 0), _Catcher)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/discord"
    srv.shutdown()


def test_forced_fail_reaches_discord_and_is_recorded(catcher_url):
    h = _user()
    c = _check(h, expectations={"min_new_records": 1}, retry_before_alert=False,
               alert_channels=[{"kind": "discord", "target": catcher_url}])
    cid = c["id"]
    for expected_runs in (1, 2):
        requests.post(f"{API}/checks/{cid}/run", headers=h)
        deadline = time.time() + 20
        while time.time() < deadline and len(requests.get(f"{API}/checks/{cid}/runs", headers=h).json()) < expected_runs:
            time.sleep(0.5)
    runs = requests.get(f"{API}/checks/{cid}/runs", headers=h).json()
    assert runs[0]["verdict"] == "FAIL"
    deadline = time.time() + 10
    while time.time() < deadline and not _Catcher.received:
        time.sleep(0.3)
    assert _Catcher.received and _Catcher.received[0]["content"].startswith(":rotating_light: *FAIL*")
    deadline = time.time() + 10
    while time.time() < deadline and not requests.get(f"{API}/runs/{runs[0]['id']}", headers=h).json().get("alerts_sent"):
        time.sleep(0.3)
    sent = requests.get(f"{API}/runs/{runs[0]['id']}", headers=h).json()["alerts_sent"]
    assert sent == [{"kind": "discord", "ok": True}]
