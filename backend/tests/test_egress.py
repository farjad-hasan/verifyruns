"""openspec/changes/egress-lockdown — pure policy tests plus enforcement against a
second uvicorn started here with private egress OFF and tiny rate limits.
The :8000 dev server keeps VR_ALLOW_PRIVATE_EGRESS=1 for the Postgres/catcher tests."""
import asyncio
import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx
import pytest
import requests

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "verifyruns_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", "hsLjFBtzKJmHY03ZV8sw3a1J5FywQoezQBNkrsPqp0U=")
BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import server  # noqa: E402
from server import _egress_violation, _RateLimiter, _fetch_records  # noqa: E402


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ---------- policy ----------

@pytest.mark.parametrize("target", [
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:8000/api",
    "http://localhost/api",
    "http://10.0.0.5/x",
    "https://192.168.1.10/x",
    "http://[::1]/",
    "http://[fd00::1]/",
    "postgresql://u:p@10.0.0.5:5432/db",
    "postgres://u:p@localhost:5434/vr",
])
def test_private_targets_are_violations(target):
    msg = _egress_violation(target, allow_private=False)
    assert msg and msg.startswith("Destination must be a public address")


def test_unresolvable_host_is_a_violation():
    msg = _egress_violation("https://no-such-host.invalid/x", allow_private=False)
    assert msg and "could not be resolved" in msg


def test_public_host_is_allowed():
    assert _egress_violation("https://api.airtable.com/v0/app/tbl", allow_private=False) is None


def test_switch_allows_private():
    assert _egress_violation("http://127.0.0.1:8000/api", allow_private=True) is None
    assert _egress_violation("postgres://u:p@localhost:5434/vr", allow_private=True) is None


# ---------- rate limiter ----------

def test_rate_limiter_counts_per_key_and_expires():
    now = [1000.0]
    rl = _RateLimiter(limit=3, window_seconds=60, clock=lambda: now[0])
    assert [rl.allow("a") for _ in range(3)] == [True, True, True]
    assert rl.allow("a") is False
    assert rl.allow("b") is True
    now[0] += 61
    assert rl.allow("a") is True
    assert rl.retry_after("a") >= 0


# ---------- streamed cap ----------

def test_oversized_response_is_abandoned(monkeypatch):
    big = b"[" + b"1," * 3_000_000 + b"1]"  # ~6 MB
    monkeypatch.setattr(server, "MAX_RESPONSE_BYTES", 5 * 1024 * 1024)
    monkeypatch.setattr(server, "EGRESS_ALLOW_PRIVATE", True)

    def handler(request):
        return httpx.Response(200, content=big, headers={"content-type": "application/json"})
    monkeypatch.setattr(server, "_http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    records, meta, err, details = _run(_fetch_records("http_json", {"url": "https://example.com/big"}))
    assert records is None
    assert err == "Destination response exceeded 5 MB."


# ---------- enforcement on a locked-down server ----------

def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="module")
def locked():
    port = _free_port()
    env = {**os.environ, "VR_ALLOW_PRIVATE_EGRESS": "0", "VR_RATE_AUTH_PER_MIN": "5", "VR_RATE_HOOK_PER_MIN": "3",
           "VR_HEARTBEAT_TICK_SECONDS": "3600"}
    for k in ("MONGO_URL", "DB_NAME", "JWT_SECRET", "FERNET_KEY"):
        env.pop(k, None)  # let backend/.env supply the real ones
    proc = subprocess.Popen([str(BACKEND / ".venv" / "bin" / "uvicorn"), "server:app", "--port", str(port)],
                            cwd=str(BACKEND), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/api"
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            if requests.get(f"{base}/", timeout=1).status_code == 200:
                break
        except Exception:
            time.sleep(0.3)
    else:
        proc.kill()
        raise RuntimeError("locked-down server did not start")
    yield base
    proc.terminate()
    proc.wait(timeout=10)


def _user(base):
    r = requests.post(f"{base}/auth/register", json={"email": f"test_eg_{uuid.uuid4().hex[:8]}@example.com", "password": "pass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_private_http_destination_refused(locked):
    h = _user(locked)
    r = requests.post(f"{locked}/checks", headers=h, json={"name": "x", "connector_kind": "http_json", "config": {"url": "http://127.0.0.1:9/x"}})
    assert r.status_code == 400
    assert r.json()["detail"].startswith("Destination must be a public address (127.0.0.1 is private)")


def test_private_postgres_destination_refused(locked):
    h = _user(locked)
    r = requests.post(f"{locked}/checks", headers=h, json={"name": "x", "connector_kind": "postgres",
                                                            "config": {"dsn": "postgresql://postgres:vr@localhost:5434/vr", "query": "SELECT 1"}})
    assert r.status_code == 400 and "public address" in r.json()["detail"]


def test_public_destination_still_saves(locked):
    h = _user(locked)
    r = requests.post(f"{locked}/checks", headers=h, json={"name": "ok", "connector_kind": "http_json", "config": {"url": "https://jsonplaceholder.typicode.com/todos"}})
    assert r.status_code == 200, r.text


def test_webhook_rate_limited_per_secret(locked):
    h = _user(locked)
    c = requests.post(f"{locked}/checks", headers=h, json={"name": "hook", "connector_kind": "http_json", "config": {"url": "https://jsonplaceholder.typicode.com/todos"}}).json()
    codes = [requests.post(f"{locked}/hook/{c['webhook_secret']}").status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429


def test_login_rate_limited_per_ip(locked):
    # the registrations above already spent some of the 5/min auth budget from this IP; exhaust it
    codes = []
    for _ in range(8):
        r = requests.post(f"{locked}/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
        codes.append(r.status_code)
        if r.status_code == 429:
            assert r.headers.get("Retry-After")
            break
    assert 429 in codes
