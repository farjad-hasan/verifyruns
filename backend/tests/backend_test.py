"""Backend tests for RunProof."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEST_URL = "https://jsonplaceholder.typicode.com/todos"


def _rand_email(prefix="user"):
    return f"test_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture(scope="module")
def user_a():
    email = _rand_email("a")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "password": "pass123", "token": data["token"], "id": data["user"]["id"]}


@pytest.fixture(scope="module")
def user_b():
    email = _rand_email("b")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "pass123"})
    assert r.status_code == 200
    data = r.json()
    return {"email": email, "password": "pass123", "token": data["token"], "id": data["user"]["id"]}


def _h(u):
    return {"Authorization": f"Bearer {u['token']}"}


# ---------- AUTH ----------
class TestAuth:
    def test_register_normalises_email(self):
        email = _rand_email("norm")
        r = requests.post(f"{API}/auth/register", json={"email": email.upper(), "password": "pass123"})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == email.lower()

    def test_register_duplicate(self, user_a):
        r = requests.post(f"{API}/auth/register", json={"email": user_a["email"], "password": "pass123"})
        assert r.status_code == 400

    def test_login_success(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": user_a["password"]})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_password(self, user_a):
        r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "wrongpass"})
        assert r.status_code == 401

    def test_login_missing_user(self):
        r = requests.post(f"{API}/auth/login", json={"email": _rand_email("ghost"), "password": "pass123"})
        assert r.status_code == 401

    def test_me_with_token(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=_h(user_a))
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == user_a["email"]
        assert "password_hash" not in data

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)


# ---------- CHECK CRUD ----------
class TestChecks:
    def test_create_check_with_token_masks(self, user_a):
        payload = {
            "name": "TEST_check_masked",
            "config": {"url": DEST_URL, "bearer_token": "supersecrettoken1234"},
            "expectations": {"min_new_records": 1, "required_fields": ["id", "title"], "non_empty_fields": ["title"]},
        }
        r = requests.post(f"{API}/checks", json=payload, headers=_h(user_a))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["config"]["has_bearer_token"] is True
        assert d["config"]["bearer_token_last4"].endswith("1234")
        assert "bearer_token" not in d["config"]
        assert "bearer_token_encrypted" not in d["config"]
        assert "webhook_secret" in d
        user_a["check_masked_id"] = d["id"]

    def test_create_check_no_token(self, user_a):
        payload = {
            "name": "TEST_check_notoken",
            "config": {"url": DEST_URL},
            "expectations": {"min_new_records": 1, "required_fields": ["id", "title", "completed"], "non_empty_fields": ["title"]},
        }
        r = requests.post(f"{API}/checks", json=payload, headers=_h(user_a))
        assert r.status_code == 200
        d = r.json()
        assert d["config"]["has_bearer_token"] is False
        user_a["check_id"] = d["id"]
        user_a["webhook_secret"] = d["webhook_secret"]

    def test_list_hides_webhook_secret(self, user_a):
        r = requests.get(f"{API}/checks", headers=_h(user_a))
        assert r.status_code == 200
        for c in r.json():
            assert "webhook_secret" not in c
            assert "recent_runs" in c
            assert "last_verdict" in c

    def test_get_check_returns_webhook_secret(self, user_a):
        r = requests.get(f"{API}/checks/{user_a['check_id']}", headers=_h(user_a))
        assert r.status_code == 200
        assert "webhook_secret" in r.json()

    def test_user_isolation(self, user_a, user_b):
        r = requests.get(f"{API}/checks/{user_a['check_id']}", headers=_h(user_b))
        assert r.status_code == 404

    def test_patch_preserves_token(self, user_a):
        cid = user_a["check_masked_id"]
        payload = {"config": {"url": DEST_URL}}  # no bearer_token in update
        r = requests.patch(f"{API}/checks/{cid}", json=payload, headers=_h(user_a))
        assert r.status_code == 200
        d = r.json()
        assert d["config"]["has_bearer_token"] is True, "encrypted token should be preserved when not provided"
        assert d["config"]["bearer_token_last4"].endswith("1234")


# ---------- WEBHOOK & VERDICTS ----------
class TestExecution:
    def _create(self, user, name, expectations, json_path=None):
        cfg = {"url": DEST_URL}
        if json_path is not None:
            cfg["json_path"] = json_path
        r = requests.post(
            f"{API}/checks",
            json={"name": name, "config": cfg, "expectations": expectations},
            headers=_h(user),
        )
        assert r.status_code == 200, r.text
        return r.json()

    def _wait_run(self, user, check_id, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            r = requests.get(f"{API}/checks/{check_id}/runs", headers=_h(user))
            if r.status_code == 200 and r.json():
                return r.json()[0]
            time.sleep(1)
        return None

    def test_webhook_pass(self, user_a):
        c = self._create(user_a, "TEST_webhook_pass", {"min_new_records": 1, "required_fields": ["id", "title"], "non_empty_fields": ["title"]})
        r = requests.post(f"{API}/hook/{c['webhook_secret']}")
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is True and "run_id" in body
        run = self._wait_run(user_a, c["id"])
        assert run, "no run recorded"
        assert run["trigger"] == "webhook"
        assert run["verdict"] == "PASS", run.get("diff_message")
        assert run["fingerprint"]["record_count"] == 200
        assert "id" in run["fingerprint"]["fields"]
        assert run["fingerprint"]["newest_record"]
        assert "null_pct" in run["fingerprint"]

    def test_webhook_unknown_secret(self):
        r = requests.post(f"{API}/hook/nonexistentsecret1234")
        assert r.status_code == 404

    def test_manual_run(self, user_a):
        c = self._create(user_a, "TEST_manual", {"min_new_records": 1, "required_fields": ["id"]})
        r = requests.post(f"{API}/checks/{c['id']}/run", headers=_h(user_a))
        assert r.status_code == 200
        assert r.json()["status"] == "queued"
        run = self._wait_run(user_a, c["id"])
        assert run and run["trigger"] == "manual"

    def test_verdict_missing_required_field(self, user_a):
        c = self._create(user_a, "TEST_missing_field", {"min_new_records": 1, "required_fields": ["nonexistent_field"]})
        requests.post(f"{API}/checks/{c['id']}/run", headers=_h(user_a))
        run = self._wait_run(user_a, c["id"])
        assert run["verdict"] == "FAIL"
        assert "`nonexistent_field`" in run["diff_message"]
        assert run["diff_message"].startswith("Run reported success, but ")

    def test_verdict_wrong_json_path(self, user_a):
        c = self._create(user_a, "TEST_bad_path", {"min_new_records": 1}, json_path="data.records")
        requests.post(f"{API}/checks/{c['id']}/run", headers=_h(user_a))
        run = self._wait_run(user_a, c["id"])
        assert run["verdict"] == "FAIL"
        assert "data.records" in run["diff_message"]

    def test_verdict_non_empty_field_empty(self, user_a):
        # todos newest record: userId=10, id=200, title=..., completed=false
        # 'completed' is False which is not "empty" per _is_empty. Use a truly empty logic:
        # Instead use required_fields that exist but non_empty on a boolean field with value false — false is not empty.
        # Try: set non_empty_fields to a field 'title' which is non-empty (should still PASS). To force FAIL,
        # jsonplaceholder /posts has some fields; but to reliably force empty we skip and note limitation.
        # Use /todos and required 'nothing' — actually just verify non_empty logic on a real empty by requiring
        # a non_empty field 'userId' which is int non-zero -> PASS. Skip forcing FAIL here.
        pytest.skip("No public endpoint reliably provides empty field in newest record for this assertion")

    def test_delete_check(self, user_a):
        c = self._create(user_a, "TEST_todelete", {"min_new_records": 1})
        r = requests.delete(f"{API}/checks/{c['id']}", headers=_h(user_a))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/checks/{c['id']}", headers=_h(user_a))
        assert r2.status_code == 404
