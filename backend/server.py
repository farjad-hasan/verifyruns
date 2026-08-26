from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import json
import uuid
import secrets
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any

import bcrypt
import jwt
import httpx
import asyncpg
from cryptography.fernet import Fernet
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------- Setup ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = 7

fernet = Fernet(os.environ["FERNET_KEY"].encode())

app = FastAPI(title="VerifyRuns API")
api = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("verifyruns")

# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def encrypt_secret(plain: str) -> str:
    if not plain:
        return ""
    return fernet.encrypt(plain.encode()).decode()

def decrypt_secret(cipher: str) -> str:
    if not cipher:
        return ""
    try:
        return fernet.decrypt(cipher.encode()).decode()
    except Exception:
        return ""

def mask_token(plain: str) -> str:
    if not plain:
        return ""
    if len(plain) <= 4:
        return "•" * len(plain)
    return "•" * 8 + plain[-4:]

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("_id", None)
    return user

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class HttpConfig(BaseModel):
    url: str
    bearer_token: Optional[str] = None  # plain input from client
    json_path: Optional[str] = None     # dotted path to array, e.g. "data.records"

class Expectations(BaseModel):
    min_new_records: int = 1
    required_fields: List[str] = []
    non_empty_fields: List[str] = []

class CheckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    connector_kind: str = "http_json"
    config: dict  # shape depends on connector_kind; validated per-connector
    expectations: Expectations = Expectations()
    alert_slack_webhook: Optional[str] = None
    retry_before_alert: bool = True

class CheckUpdate(BaseModel):
    name: Optional[str] = None
    connector_kind: Optional[str] = None
    config: Optional[dict] = None
    expectations: Optional[Expectations] = None
    alert_slack_webhook: Optional[str] = None
    clear_alert_slack: Optional[bool] = False
    retry_before_alert: Optional[bool] = None

class SnoozeIn(BaseModel):
    hours: int = Field(ge=1, le=168)  # cap at a week

# ---------- Auth ----------
@api.post("/auth/register")
async def register(payload: RegisterIn):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = make_token(user_id, email)
    return {"token": token, "user": {"id": user_id, "email": email}}

@api.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "email": email}}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------- Check CRUD ----------
RETRY_DELAY_SECONDS = int(os.environ.get("VR_RETRY_DELAY_SECONDS", "30"))

def _prepare_config_for_storage(kind: str, cfg_in: dict, existing_cfg: Optional[dict] = None) -> dict:
    """Validate + normalise a config dict per connector, encrypting secrets and
    preserving previously encrypted values when the client omits them."""
    existing_cfg = existing_cfg or {}
    if kind == "http_json":
        url = (cfg_in or {}).get("url")
        if not isinstance(url, str) or not url.strip():
            raise HTTPException(400, "config.url is required for http_json")
        out: dict = {"url": url.strip(), "json_path": (cfg_in.get("json_path") or None)}
        plain = cfg_in.get("bearer_token")
        if plain:
            out["bearer_token_encrypted"] = encrypt_secret(plain)
        elif existing_cfg.get("bearer_token_encrypted"):
            out["bearer_token_encrypted"] = existing_cfg["bearer_token_encrypted"]
        return out
    if kind == "airtable":
        base_id = (cfg_in or {}).get("base_id")
        table = (cfg_in or {}).get("table")
        if not isinstance(base_id, str) or not base_id.strip():
            raise HTTPException(400, "config.base_id is required for airtable")
        if not isinstance(table, str) or not table.strip():
            raise HTTPException(400, "config.table is required for airtable")
        out = {"base_id": base_id.strip(), "table": table.strip(), "view": (cfg_in.get("view") or None)}
        plain = cfg_in.get("personal_access_token")
        if plain:
            out["pat_encrypted"] = encrypt_secret(plain)
        elif existing_cfg.get("pat_encrypted"):
            out["pat_encrypted"] = existing_cfg["pat_encrypted"]
        return out
    if kind == "postgres":
        query = (cfg_in or {}).get("query")
        if not isinstance(query, str) or not query.strip():
            raise HTTPException(400, "config.query is required for postgres")
        q = query.strip().rstrip(";").strip()
        # Read-only guard: single SELECT statement, no dangerous keywords
        upper = q.upper()
        if not upper.startswith("SELECT") and not upper.startswith("WITH"):
            raise HTTPException(400, "postgres query must start with SELECT or WITH")
        if ";" in q:
            raise HTTPException(400, "postgres query must be a single statement (no semicolons)")
        banned = ["INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "TRUNCATE ", "GRANT ", "REVOKE ", "CREATE ", "COMMENT "]
        if any(b in upper for b in banned):
            raise HTTPException(400, "postgres query is not read-only")
        out = {"query": q}
        plain_dsn = cfg_in.get("dsn")
        if plain_dsn:
            if not isinstance(plain_dsn, str) or not plain_dsn.strip():
                raise HTTPException(400, "config.dsn is required for postgres")
            out["dsn_encrypted"] = encrypt_secret(plain_dsn.strip())
        elif existing_cfg.get("dsn_encrypted"):
            out["dsn_encrypted"] = existing_cfg["dsn_encrypted"]
        else:
            raise HTTPException(400, "config.dsn is required for postgres")
        return out
    raise HTTPException(400, f"Unknown connector kind: {kind}")

def _sanitize_config(kind: str, cfg: dict) -> dict:
    out = {**(cfg or {})}
    if kind == "http_json":
        enc = out.pop("bearer_token_encrypted", None)
        out["has_bearer_token"] = bool(enc)
        if enc:
            out["bearer_token_last4"] = mask_token(decrypt_secret(enc))
    elif kind == "airtable":
        enc = out.pop("pat_encrypted", None)
        out["has_pat"] = bool(enc)
        if enc:
            out["pat_last4"] = mask_token(decrypt_secret(enc))
    elif kind == "postgres":
        enc = out.pop("dsn_encrypted", None)
        out["has_dsn"] = bool(enc)
        if enc:
            out["dsn_last4"] = mask_token(decrypt_secret(enc))
    return out

def _sanitize_check(doc: dict, include_webhook_secret: bool = True) -> dict:
    doc.pop("_id", None)
    kind = doc.get("connector_kind", "http_json")
    doc["config"] = _sanitize_config(kind, doc.get("config") or {})
    # Alert channels: never leak Slack webhook URL
    slack_enc = doc.pop("alert_slack_webhook_encrypted", None)
    if slack_enc:
        doc["has_alert_slack"] = True
        doc["alert_slack_last4"] = mask_token(decrypt_secret(slack_enc))
    else:
        doc["has_alert_slack"] = False
    # Public status: expose the token to the owner so they can share the URL
    doc["is_public"] = bool(doc.get("public_token"))
    # Snooze
    snooze_until = doc.get("snooze_until")
    doc["is_snoozed"] = bool(snooze_until and snooze_until > now_iso())
    # Retry toggle (default True for older docs)
    doc["retry_before_alert"] = bool(doc.get("retry_before_alert", True))
    if not include_webhook_secret:
        doc.pop("webhook_secret", None)
    return doc

@api.post("/checks")
async def create_check(payload: CheckCreate, user: dict = Depends(get_current_user)):
    cid = str(uuid.uuid4())
    cfg = _prepare_config_for_storage(payload.connector_kind, payload.config)
    doc = {
        "id": cid,
        "user_id": user["id"],
        "name": payload.name,
        "connector_kind": payload.connector_kind,
        "config": cfg,
        "expectations": payload.expectations.model_dump(),
        "webhook_secret": secrets.token_urlsafe(32),
        "created_at": now_iso(),
        "retry_before_alert": payload.retry_before_alert,
    }
    if payload.alert_slack_webhook:
        doc["alert_slack_webhook_encrypted"] = encrypt_secret(payload.alert_slack_webhook.strip())
    await db.checks.insert_one(doc)
    return _sanitize_check({**doc})

@api.get("/checks")
async def list_checks(user: dict = Depends(get_current_user)):
    checks = await db.checks.find({"user_id": user["id"]}).sort("created_at", -1).to_list(500)
    result = []
    for c in checks:
        last_runs = await db.check_runs.find(
            {"check_id": c["id"]}, {"_id": 0, "verdict": 1, "timestamp": 1, "id": 1}
        ).sort("timestamp", -1).limit(30).to_list(30)
        last_runs.reverse()  # oldest -> newest for timeline (newest on right)
        sanitized = _sanitize_check(c, include_webhook_secret=False)
        sanitized["recent_runs"] = last_runs
        sanitized["last_verdict"] = last_runs[-1]["verdict"] if last_runs else None
        result.append(sanitized)
    return result

@api.get("/checks/{check_id}")
async def get_check(check_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    return _sanitize_check(c)

@api.patch("/checks/{check_id}")
async def update_check(check_id: str, payload: CheckUpdate, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.expectations is not None:
        updates["expectations"] = payload.expectations.model_dump()
    if payload.connector_kind is not None:
        updates["connector_kind"] = payload.connector_kind
    if payload.config is not None:
        kind = payload.connector_kind or c.get("connector_kind", "http_json")
        updates["config"] = _prepare_config_for_storage(kind, payload.config, c.get("config"))
    if payload.retry_before_alert is not None:
        updates["retry_before_alert"] = bool(payload.retry_before_alert)
    if payload.clear_alert_slack:
        updates["alert_slack_webhook_encrypted"] = None
    elif payload.alert_slack_webhook is not None and payload.alert_slack_webhook.strip():
        updates["alert_slack_webhook_encrypted"] = encrypt_secret(payload.alert_slack_webhook.strip())
    if updates:
        # Use $unset for None fields so we actually remove them
        set_ops = {k: v for k, v in updates.items() if v is not None}
        unset_ops = {k: "" for k, v in updates.items() if v is None}
        mongo_update: dict = {}
        if set_ops:
            mongo_update["$set"] = set_ops
        if unset_ops:
            mongo_update["$unset"] = unset_ops
        await db.checks.update_one({"id": check_id}, mongo_update)
    updated = await db.checks.find_one({"id": check_id})
    return _sanitize_check(updated)

@api.delete("/checks/{check_id}")
async def delete_check(check_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    await db.checks.delete_one({"id": check_id})
    await db.check_runs.delete_many({"check_id": check_id})
    return {"ok": True}

@api.post("/checks/{check_id}/snooze")
async def snooze_check(check_id: str, payload: SnoozeIn, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    until = datetime.now(timezone.utc) + timedelta(hours=payload.hours)
    until_iso = until.isoformat()
    await db.checks.update_one({"id": check_id}, {"$set": {"snooze_until": until_iso}})
    return {"snooze_until": until_iso, "is_snoozed": True}

@api.delete("/checks/{check_id}/snooze")
async def wake_check(check_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    await db.checks.update_one({"id": check_id}, {"$unset": {"snooze_until": ""}})
    return {"is_snoozed": False}

@api.post("/checks/{check_id}/public")
async def enable_public(check_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    token = c.get("public_token") or secrets.token_urlsafe(24)
    await db.checks.update_one({"id": check_id}, {"$set": {"public_token": token}})
    return {"public_token": token, "is_public": True}

@api.delete("/checks/{check_id}/public")
async def disable_public(check_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    await db.checks.update_one({"id": check_id}, {"$unset": {"public_token": ""}})
    return {"is_public": False}

@api.get("/public/checks/{token}")
async def public_check(token: str):
    c = await db.checks.find_one({"public_token": token})
    if not c:
        raise HTTPException(404, "Not found")
    runs = await db.check_runs.find(
        {"check_id": c["id"]}, {"_id": 0, "id": 1, "verdict": 1, "timestamp": 1, "diff_message": 1, "trigger": 1}
    ).sort("timestamp", -1).limit(30).to_list(30)
    return {
        "name": c["name"],
        "connector_kind": c.get("connector_kind", "http_json"),
        "last_verdict": runs[0]["verdict"] if runs else None,
        "runs": runs,
    }

# ---------- Runs ----------
@api.get("/checks/{check_id}/runs")
async def list_runs(check_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    runs = await db.check_runs.find({"check_id": check_id}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return runs

@api.get("/runs/{run_id}")
async def get_run(run_id: str, user: dict = Depends(get_current_user)):
    run = await db.check_runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(404, "Run not found")
    c = await db.checks.find_one({"id": run["check_id"], "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Run not found")
    return run

@api.post("/checks/{check_id}/run")
async def run_check_now(check_id: str, bg: BackgroundTasks, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    run_id = str(uuid.uuid4())
    bg.add_task(execute_check, check_id, "manual", run_id)
    return {"run_id": run_id, "status": "queued"}

# ---------- Webhook (async) ----------
@api.post("/hook/{secret}")
async def webhook(secret: str, bg: BackgroundTasks):
    c = await db.checks.find_one({"webhook_secret": secret})
    if not c:
        raise HTTPException(404, "Unknown webhook")
    run_id = str(uuid.uuid4())
    bg.add_task(execute_check, c["id"], "webhook", run_id)
    return {"accepted": True, "run_id": run_id}

# ---------- Check execution logic ----------
def _get_records(payload: Any, json_path: Optional[str]) -> Optional[List[dict]]:
    node = payload
    if json_path:
        for part in json_path.split("."):
            part = part.strip()
            if not part:
                continue
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return None
    if isinstance(node, list):
        return [x for x in node if isinstance(x, dict)]
    return None

def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    if isinstance(v, (list, dict)) and len(v) == 0:
        return True
    return False

def _fingerprint(records: List[dict]) -> dict:
    count = len(records)
    fields: set = set()
    for r in records:
        fields.update(r.keys())
    field_list = sorted(fields)
    null_pct: dict = {}
    if count > 0:
        for f in field_list:
            empties = sum(1 for r in records if _is_empty(r.get(f))) if f else 0
            null_pct[f] = round((empties / count) * 100, 1)
    newest = records[-1] if records else None
    return {
        "record_count": count,
        "fields": field_list,
        "newest_record": newest,
        "null_pct": null_pct,
    }

def _human_join(items: List[str]) -> str:
    items = [x for x in items if x]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"

def _compute_verdict(fp: dict, prev_passes: List[dict], expectations: dict) -> tuple:
    """Return (verdict, diff_message)."""
    reasons: List[str] = []
    min_new = int(expectations.get("min_new_records", 1) or 0)
    required = [f.strip() for f in expectations.get("required_fields", []) if f.strip()]
    non_empty = [f.strip() for f in expectations.get("non_empty_fields", []) if f.strip()]

    prev_last = prev_passes[-1] if prev_passes else None
    prev_count = prev_last["fingerprint"]["record_count"] if prev_last else 0
    delta = fp["record_count"] - prev_count if prev_last else fp["record_count"]

    if prev_last and delta < min_new:
        reasons.append(
            f"the destination gained {delta} records (expected at least {min_new})"
        )
    elif not prev_last and fp["record_count"] < min_new:
        reasons.append(
            f"the destination has only {fp['record_count']} records (expected at least {min_new})"
        )

    # required fields missing
    missing_required = [f for f in required if f not in fp["fields"]]
    for f in missing_required:
        reasons.append(f"the field `{f}` is missing")

    # previously always-present fields that disappeared
    if prev_passes:
        always_present: set = set(prev_passes[0]["fingerprint"]["fields"])
        for p in prev_passes[1:]:
            always_present &= set(p["fingerprint"]["fields"])
        disappeared = [
            f for f in always_present
            if f not in fp["fields"] and f not in missing_required
        ]
        for f in disappeared:
            reasons.append(f"the field `{f}` disappeared — it was present in the last {len(prev_passes)} good runs")

    # non-empty check: look at newest record
    newest = fp.get("newest_record") or {}
    for f in non_empty:
        if f in fp["fields"] and _is_empty(newest.get(f)):
            reasons.append(f"the field `{f}` is empty in the newest record")

    if reasons:
        return "FAIL", "Run reported success, but " + _human_join(reasons) + "."
    if not prev_last:
        return "PASS", f"First successful check. Destination has {fp['record_count']} records across {len(fp['fields'])} fields."
    return "PASS", f"Destination gained {delta} record(s). All expectations met."

async def _fetch_records(kind: str, cfg: dict):
    """Return (records, error_message, error_details). If records is None, error_message is set."""
    if kind == "http_json":
        url = cfg.get("url")
        headers = {}
        enc = cfg.get("bearer_token_encrypted")
        if enc:
            plain = decrypt_secret(enc)
            if plain:
                headers["Authorization"] = f"Bearer {plain}"
        json_path = cfg.get("json_path") or None
        async with httpx.AsyncClient(timeout=20.0) as hc:
            resp = await hc.get(url, headers=headers)
        if resp.status_code >= 400:
            return None, f"Destination fetch failed with HTTP {resp.status_code}.", resp.text[:500]
        try:
            body = resp.json()
        except Exception:
            return None, "Destination did not return valid JSON.", None
        records = _get_records(body, json_path)
        if records is None:
            return None, f"Could not find an array of records at path `{json_path or '(root)'}`.", None
        return records, None, None

    if kind == "airtable":
        from urllib.parse import quote
        base_id = cfg.get("base_id")
        table = cfg.get("table")
        view = cfg.get("view")
        headers = {}
        enc = cfg.get("pat_encrypted")
        if enc:
            plain = decrypt_secret(enc)
            if plain:
                headers["Authorization"] = f"Bearer {plain}"
        url = f"https://api.airtable.com/v0/{base_id}/{quote(table, safe='')}?maxRecords=100"
        if view:
            url += f"&view={quote(view, safe='')}"
        async with httpx.AsyncClient(timeout=20.0) as hc:
            resp = await hc.get(url, headers=headers)
        if resp.status_code >= 400:
            return None, f"Airtable fetch failed with HTTP {resp.status_code}.", resp.text[:500]
        try:
            body = resp.json()
        except Exception:
            return None, "Airtable did not return valid JSON.", None
        raw = body.get("records") if isinstance(body, dict) else None
        if not isinstance(raw, list):
            return None, "Airtable response is missing the `records` array.", None
        flat = []
        for r in raw:
            if not isinstance(r, dict):
                continue
            row = {"id": r.get("id"), "createdTime": r.get("createdTime")}
            fields = r.get("fields") or {}
            if isinstance(fields, dict):
                row.update(fields)
            flat.append(row)
        return flat, None, None

    if kind == "postgres":
        dsn_enc = cfg.get("dsn_encrypted")
        query = cfg.get("query")
        if not dsn_enc or not query:
            return None, "Postgres config is missing DSN or query.", None
        dsn = decrypt_secret(dsn_enc)
        conn = None
        try:
            conn = await asyncpg.connect(dsn=dsn, timeout=15.0)
            # Enforce read-only at the session level as a second line of defence
            await conn.execute("SET default_transaction_read_only = on")
            rows = await conn.fetch(f"SELECT * FROM ({query}) AS _vr LIMIT 100")
        except asyncpg.PostgresError as e:
            return None, f"Postgres query failed: {type(e).__name__}.", str(e)[:500]
        except Exception as e:
            return None, f"Postgres connection error: {type(e).__name__}.", str(e)[:500]
        finally:
            if conn is not None:
                try:
                    await conn.close()
                except Exception:
                    pass
        flat = []
        for r in rows:
            row = {}
            for k, v in dict(r).items():
                # Coerce non-JSON-serialisable values to strings for fingerprinting
                if isinstance(v, (str, int, float, bool)) or v is None:
                    row[k] = v
                else:
                    row[k] = str(v)
            flat.append(row)
        return flat, None, None

    return None, f"Unknown connector kind: {kind}", None


async def execute_check(check_id: str, trigger: str, run_id: str, is_retry: bool = False):
    c = await db.checks.find_one({"id": check_id})
    if not c:
        return
    kind = c.get("connector_kind", "http_json")
    cfg = c.get("config", {}) or {}
    expectations = c.get("expectations", {}) or {}

    verdict = "FAIL"
    message = ""
    fp: dict = {"record_count": 0, "fields": [], "newest_record": None, "null_pct": {}}
    error_details: Optional[str] = None

    try:
        records, err_msg, err_body = await _fetch_records(kind, cfg)
        if records is None:
            verdict = "FAIL"
            message = err_msg or "Destination fetch failed."
            error_details = err_body
        else:
            fp = _fingerprint(records)
            prev = await db.check_runs.find(
                {"check_id": check_id, "verdict": "PASS"}, {"_id": 0}
            ).sort("timestamp", -1).limit(30).to_list(30)
            prev.reverse()
            verdict, message = _compute_verdict(fp, prev, expectations)
    except httpx.HTTPError as e:
        verdict = "FAIL"
        message = f"Destination fetch error: {type(e).__name__}."
        error_details = str(e)[:500]
    except Exception as e:
        verdict = "FAIL"
        message = f"Unexpected error while checking destination: {type(e).__name__}."
        error_details = str(e)[:500]
        log.exception("execute_check error")

    run_doc = {
        "id": run_id,
        "check_id": check_id,
        "timestamp": now_iso(),
        "trigger": trigger,
        "verdict": verdict,
        "diff_message": message,
        "fingerprint": fp,
        "error_details": error_details,
        "is_retry": is_retry,
    }
    await db.check_runs.insert_one(run_doc)

    # Decide alert routing (retry + snooze aware) — never let alert paths fail the run
    try:
        last_alerted = c.get("last_alerted_verdict")
        snoozed = bool(c.get("snooze_until") and c["snooze_until"] > now_iso())
        would_be_fresh_fail = (verdict == "FAIL" and last_alerted != "FAIL")
        retry_enabled = c.get("retry_before_alert", True)
        if (not is_retry) and would_be_fresh_fail and retry_enabled and not snoozed:
            # Retry once before waking anyone — schedule a delayed re-run
            asyncio.create_task(_schedule_retry(check_id))
        else:
            await _maybe_alert(c, run_doc, snoozed=snoozed)
    except Exception:
        log.exception("post-run alert routing failed for run %s", run_id)


async def _schedule_retry(check_id: str):
    try:
        await asyncio.sleep(RETRY_DELAY_SECONDS)
        await execute_check(check_id, "retry", str(uuid.uuid4()), is_retry=True)
    except Exception:
        log.exception("retry scheduling failed for check %s", check_id)


async def _maybe_alert(check_doc: dict, run: dict, snoozed: bool = False):
    """Alert on state transitions using last_alerted_verdict tracked on the check."""
    slack_enc = check_doc.get("alert_slack_webhook_encrypted")
    if not slack_enc:
        return
    if snoozed:
        log.info("alerts snoozed for check %s until %s", check_doc.get("id"), check_doc.get("snooze_until"))
        return

    verdict = run["verdict"]
    # Re-read the check to get the latest last_alerted_verdict (a concurrent retry may have updated it)
    fresh = await db.checks.find_one({"id": check_doc["id"]}, {"_id": 0, "last_alerted_verdict": 1})
    last_alerted = (fresh or {}).get("last_alerted_verdict")

    header = ""
    new_last_alerted = last_alerted
    if verdict == "FAIL" and last_alerted != "FAIL":
        header = f":rotating_light: *FAIL* — {check_doc.get('name')}"
        new_last_alerted = "FAIL"
    elif verdict == "PASS" and last_alerted == "FAIL":
        header = f":white_check_mark: *Recovered* — {check_doc.get('name')}"
        new_last_alerted = "PASS"
    else:
        return

    slack_url = decrypt_secret(slack_enc)
    if not slack_url:
        return
    app_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    detail_link = f"{app_url}/checks/{check_doc['id']}" if app_url else ""
    text = f"{header}\n{run['diff_message']}\n_At {run['timestamp']}_"
    if detail_link:
        text += f"\n<{detail_link}|Open in VerifyRuns>"
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            resp = await hc.post(slack_url, json={"text": text})
        if resp.status_code >= 400:
            log.warning("Slack alert non-2xx: %s %s", resp.status_code, resp.text[:200])
    except Exception:
        log.exception("Slack alert POST failed")
    # Persist state only after a delivery attempt so we never dedup a truly un-sent alert
    await db.checks.update_one({"id": check_doc["id"]}, {"$set": {"last_alerted_verdict": new_last_alerted}})

# ---------- Startup ----------
@app.on_event("startup")
async def on_start():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.checks.create_index("id", unique=True)
    await db.checks.create_index("webhook_secret", unique=True)
    await db.checks.create_index("user_id")
    await db.check_runs.create_index("id", unique=True)
    await db.check_runs.create_index([("check_id", 1), ("timestamp", -1)])

@app.on_event("shutdown")
async def on_stop():
    client.close()

# ---------- Mount ----------
@api.get("/")
async def root():
    return {"app": "VerifyRuns", "ok": True}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
