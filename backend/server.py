from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import json
import hashlib
import uuid
import secrets
import logging
import asyncio
import time
import socket
import ipaddress
from collections import defaultdict, deque
from urllib.parse import urlsplit
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any, Literal

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
    newest_key: Optional[str] = None    # field whose max value marks the newest record

class Expectations(BaseModel):
    min_new_records: int = Field(default=1, ge=0)
    required_fields: List[str] = []
    non_empty_fields: List[str] = []
    # growth: count must grow by >= min_new_records (or by the claimed count when the webhook sends one)
    # steady: count must not change
    # claimed: every webhook run must carry {"wrote": N}; the destination must gain >= N
    growth_mode: Literal["growth", "steady", "claimed"] = "growth"

class ChannelIn(BaseModel):
    kind: Literal["slack", "discord", "email"]
    target: str = Field(min_length=3, max_length=2000)  # webhook URL or email address

class CheckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    connector_kind: str = "http_json"
    config: dict  # shape depends on connector_kind; validated per-connector
    expectations: Expectations = Expectations()
    alert_slack_webhook: Optional[str] = None
    retry_before_alert: bool = True
    heartbeat_hours: Optional[int] = Field(default=None, ge=1, le=720)  # expect a run at least this often
    alert_channels: List[ChannelIn] = []
    store_samples: bool = False  # keep raw newest rows + error bodies for SAMPLE_TTL_DAYS

class CheckUpdate(BaseModel):
    name: Optional[str] = None
    connector_kind: Optional[str] = None
    config: Optional[dict] = None
    expectations: Optional[Expectations] = None
    alert_slack_webhook: Optional[str] = None
    clear_alert_slack: Optional[bool] = False
    retry_before_alert: Optional[bool] = None
    heartbeat_hours: Optional[int] = Field(default=None, ge=1, le=720)  # null clears (when sent)
    store_samples: Optional[bool] = None

class SnoozeIn(BaseModel):
    hours: int = Field(ge=1, le=168)  # cap at a week


# ---------- Auth ----------
@api.post("/auth/register")
async def register(payload: RegisterIn, request: Request):
    _enforce(AUTH_LIMITER, _client_ip(request))
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
async def login(payload: LoginIn, request: Request):
    _enforce(AUTH_LIMITER, _client_ip(request))
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = make_token(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "email": email}}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.delete("/auth/me")
async def delete_me(user: dict = Depends(get_current_user)):
    """Delete the account and everything it owns: samples, runs, Checks, user."""
    check_ids = [c["id"] async for c in db.checks.find({"user_id": user["id"]}, {"id": 1})]
    if check_ids:
        await db.run_samples.delete_many({"check_id": {"$in": check_ids}})
        await db.check_runs.delete_many({"check_id": {"$in": check_ids}})
        await db.checks.delete_many({"id": {"$in": check_ids}})
    await db.users.delete_one({"id": user["id"]})
    return {"ok": True, "deleted_checks": len(check_ids)}

# ---------- Check CRUD ----------
RETRY_DELAY_SECONDS = int(os.environ.get("VR_RETRY_DELAY_SECONDS", "30"))
AIRTABLE_PAGE_SIZE = 100
AIRTABLE_MAX_RECORDS = int(os.environ.get("VR_AIRTABLE_MAX_RECORDS", "10000"))
AIRTABLE_FETCH_BUDGET_S = float(os.environ.get("VR_AIRTABLE_FETCH_BUDGET_S", "60"))
PG_SAMPLE_LIMIT = 100
PG_COUNT_TIMEOUT_MS = int(os.environ.get("VR_PG_COUNT_TIMEOUT_MS", "15000"))
PG_SAMPLE_TIMEOUT_MS = int(os.environ.get("VR_PG_SAMPLE_TIMEOUT_MS", "15000"))


def _http_client() -> httpx.AsyncClient:
    """Single place to build the outbound client (tests swap the transport).
    Redirects are not followed, so a public host cannot bounce us into a private range."""
    return httpx.AsyncClient(timeout=20.0)


# ---------- Egress policy ----------
EGRESS_ALLOW_PRIVATE = os.environ.get("VR_ALLOW_PRIVATE_EGRESS", "0").lower() in ("1", "true", "yes")
MAX_RESPONSE_BYTES = int(os.environ.get("VR_MAX_RESPONSE_BYTES", str(5 * 1024 * 1024)))
METADATA_ADDRESSES = {"169.254.169.254", "fd00:ec2::254", "100.100.100.200", "metadata.google.internal"}


def _egress_violation(target: str, allow_private: Optional[bool] = None) -> Optional[str]:
    """Return a human message when `target` (URL or Postgres DSN) points anywhere that is
    not a public address, else None. Resolves the host; any non-global answer is a violation."""
    if allow_private is None:
        allow_private = EGRESS_ALLOW_PRIVATE
    try:
        parts = urlsplit(target if "://" in target else "http://" + target)
        host = parts.hostname
    except ValueError:
        host = None
    if not host:
        return "Destination must be a public address (the URL has no host)."
    if allow_private:
        return None
    if host in METADATA_ADDRESSES:
        return f"Destination must be a public address ({host} is private). Set VR_ALLOW_PRIVATE_EGRESS=1 on a self-hosted instance to allow it."
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return f"Destination host {host} could not be resolved."
    for info in infos:
        raw = info[4][0].split("%")[0]
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError:
            continue
        if (str(ip) in METADATA_ADDRESSES or ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified or not ip.is_global):
            return f"Destination must be a public address ({ip} is private). Set VR_ALLOW_PRIVATE_EGRESS=1 on a self-hosted instance to allow it."
    return None


class _RateLimiter:
    """Sliding-window counter per key, in memory, per process."""

    def __init__(self, limit: int, window_seconds: float = 60.0, clock=time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self.clock = clock
        self.hits: dict = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque:
        dq = self.hits[key]
        while dq and dq[0] <= now - self.window:
            dq.popleft()
        return dq

    def allow(self, key: str) -> bool:
        now = self.clock()
        dq = self._prune(key, now)
        if len(dq) >= self.limit:
            return False
        dq.append(now)
        return True

    def retry_after(self, key: str) -> int:
        now = self.clock()
        dq = self._prune(key, now)
        if not dq:
            return 0
        return max(0, int(dq[0] + self.window - now) + 1)


AUTH_LIMITER = _RateLimiter(int(os.environ.get("VR_RATE_AUTH_PER_MIN", "120")))
HOOK_LIMITER = _RateLimiter(int(os.environ.get("VR_RATE_HOOK_PER_MIN", "120")))
CREATE_LIMITER = _RateLimiter(int(os.environ.get("VR_RATE_CREATE_PER_MIN", "60")))


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce(limiter: _RateLimiter, key: str) -> None:
    if not limiter.allow(key):
        raise HTTPException(429, "Too many requests", headers={"Retry-After": str(limiter.retry_after(key))})

def _prepare_config_for_storage(kind: str, cfg_in: dict, existing_cfg: Optional[dict] = None) -> dict:
    """Validate + normalise a config dict per connector, encrypting secrets and
    preserving previously encrypted values when the client omits them."""
    existing_cfg = existing_cfg or {}
    if kind == "http_json":
        url = (cfg_in or {}).get("url")
        if not isinstance(url, str) or not url.strip():
            raise HTTPException(400, "config.url is required for http_json")
        violation = _egress_violation(url.strip())
        if violation:
            raise HTTPException(400, violation)
        out: dict = {"url": url.strip(), "json_path": (cfg_in.get("json_path") or None),
                     "newest_key": ((cfg_in.get("newest_key") or "").strip() or None)}
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
            violation = _egress_violation(plain_dsn.strip())
            if violation:
                raise HTTPException(400, violation)
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
    channels = []
    if slack_enc:
        doc["has_alert_slack"] = True
        doc["alert_slack_last4"] = mask_token(decrypt_secret(slack_enc))
        channels.append({"id": "legacy-slack", "kind": "slack", "last4": doc["alert_slack_last4"]})
    else:
        doc["has_alert_slack"] = False
    channels.extend(_sanitize_channel(ch) for ch in (doc.pop("alert_channels", None) or []))
    doc["alert_channels"] = channels
    # Public status: expose the token to the owner so they can share the URL
    doc["is_public"] = bool(doc.get("public_token"))
    # Snooze
    snooze_until = doc.get("snooze_until")
    doc["is_snoozed"] = bool(snooze_until and snooze_until > now_iso())
    # Retry toggle (default True for older docs)
    doc["retry_before_alert"] = bool(doc.get("retry_before_alert", True))
    doc["heartbeat_hours"] = doc.get("heartbeat_hours")
    doc["store_samples"] = bool(doc.get("store_samples", False))
    if not include_webhook_secret:
        doc.pop("webhook_secret", None)
    return doc

@api.post("/checks")
async def create_check(payload: CheckCreate, user: dict = Depends(get_current_user)):
    _enforce(CREATE_LIMITER, user["id"])
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
        "heartbeat_hours": payload.heartbeat_hours,
        "store_samples": bool(payload.store_samples),
    }
    if payload.alert_slack_webhook:
        doc["alert_slack_webhook_encrypted"] = encrypt_secret(payload.alert_slack_webhook.strip())
    if payload.alert_channels:
        if any(ch.kind == "email" for ch in payload.alert_channels) and not _email_available():
            raise HTTPException(400, EMAIL_NOT_CONFIGURED)
        doc["alert_channels"] = [_new_channel(ch.kind, ch.target) for ch in payload.alert_channels]
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
    if "heartbeat_hours" in payload.model_fields_set:
        updates["heartbeat_hours"] = payload.heartbeat_hours  # None -> $unset below
    if payload.store_samples is not None:
        updates["store_samples"] = bool(payload.store_samples)
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
    await db.run_samples.delete_many({"check_id": check_id})
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

@api.post("/checks/{check_id}/channels")
async def add_channel(check_id: str, payload: ChannelIn, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    if payload.kind == "email" and not _email_available():
        raise HTTPException(400, EMAIL_NOT_CONFIGURED)
    ch = _new_channel(payload.kind, payload.target)
    await db.checks.update_one({"id": check_id}, {"$push": {"alert_channels": ch}})
    return _sanitize_channel(ch)

@api.delete("/checks/{check_id}/channels/{channel_id}")
async def delete_channel(check_id: str, channel_id: str, user: dict = Depends(get_current_user)):
    c = await db.checks.find_one({"id": check_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(404, "Check not found")
    if channel_id == "legacy-slack":
        await db.checks.update_one({"id": check_id}, {"$unset": {"alert_slack_webhook_encrypted": ""}})
        return {"ok": True}
    res = await db.checks.update_one({"id": check_id}, {"$pull": {"alert_channels": {"id": channel_id}}})
    if res.modified_count == 0:
        raise HTTPException(404, "Channel not found")
    return {"ok": True}

@api.get("/meta")
async def meta():
    return {"email_alerts": _email_available()}

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
    sample = await db.run_samples.find_one({"run_id": run_id}, {"_id": 0, "run_id": 0, "check_id": 0})
    if sample:
        exp = sample.get("expires_at")
        if isinstance(exp, datetime):
            sample["expires_at"] = (exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)).isoformat()
        run["sample"] = sample
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
CLAIM_KEYS = ("wrote", "expected_new", "count")


def _parse_claimed(body: Any) -> tuple:
    """Return (claimed_new, note). The workflow may say how many records it wrote;
    anything else in the body is ignored, and a non-integer claim is noted, not fatal."""
    if not isinstance(body, dict):
        return None, None
    for key in CLAIM_KEYS:
        if key in body:
            v = body[key]
            if isinstance(v, bool) or not isinstance(v, int):
                if isinstance(v, str) and v.strip().lstrip("-").isdigit():
                    return int(v.strip()), None
                return None, f"webhook body ignored: `{key}` is not an integer"
            return v, None
    return None, None


@api.post("/hook/{secret}")
async def webhook(secret: str, request: Request, bg: BackgroundTasks):
    _enforce(HOOK_LIMITER, secret)
    c = await db.checks.find_one({"webhook_secret": secret})
    if not c:
        raise HTTPException(404, "Unknown webhook")
    body: Any = None
    try:
        raw = await request.body()
        if raw:
            body = json.loads(raw)
    except Exception:
        body = None
    claimed_new, body_note = _parse_claimed(body)
    run_id = str(uuid.uuid4())
    bg.add_task(execute_check, c["id"], "webhook", run_id, False, claimed_new, body_note)
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

NEWEST_WINDOW = 5
ORDER_BY_RE = re.compile(r"\border\s+by\b", re.IGNORECASE)


def _has_order_by(query: str) -> bool:
    return bool(ORDER_BY_RE.search(query or ""))


def _sort_desc(records: List[dict], key: str) -> List[dict]:
    """Newest-first by `key`; records without the key go last, original order kept among ties."""
    with_key = [r for r in records if r.get(key) is not None]
    without = [r for r in records if r.get(key) is None]
    try:
        with_key.sort(key=lambda r: r[key], reverse=True)
    except TypeError:
        with_key.sort(key=lambda r: str(r[key]), reverse=True)
    return with_key + without


def _fingerprint(records: List[dict], total: Optional[int] = None, newest_defined: bool = True) -> dict:
    """`records` is the inspected sample, ordered newest-first by the connector;
    `total` is the destination's true record count when the connector knows it
    (defaults to the sample length); `newest_defined` is False when the connector
    could not order the sample (Postgres without ORDER BY)."""
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
    newest = records[0] if records else None
    return {
        "record_count": total if total is not None else count,
        "sample_size": count,
        "fields": field_list,
        "newest_record": newest,
        "newest_window": records[:NEWEST_WINDOW],
        "newest_defined": bool(newest_defined),
        "null_pct": null_pct,
    }

SAMPLE_TTL_DAYS = int(os.environ.get("VR_SAMPLE_TTL_DAYS", "30"))


def _canonical_hash(obj: Any) -> Optional[str]:
    """SHA-256 of the canonical JSON of a record — equality without the row."""
    if obj is None:
        return None
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _split_sample(fp: dict, error_details: Optional[str], store_samples: bool) -> tuple:
    """Return (fingerprint_to_store, sample_doc_or_None). The stored fingerprint never
    carries destination rows; the sample carries them only when the Check opted in."""
    stored = {k: v for k, v in fp.items() if k not in ("newest_record", "newest_window")}
    stored["newest_hash"] = _canonical_hash(fp.get("newest_record"))
    stored["sample_stored"] = bool(store_samples)
    if not store_samples:
        return stored, None
    expires = datetime.now(timezone.utc) + timedelta(days=SAMPLE_TTL_DAYS)
    sample = {
        "newest_record": fp.get("newest_record"),
        "newest_window": fp.get("newest_window") or [],
        "error_details": error_details,
        "expires_at": expires.isoformat(),
    }
    return stored, sample


def _human_join(items: List[str]) -> str:
    items = [x for x in items if x]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"

def _compute_verdict(fp: dict, prev_passes: List[dict], expectations: dict, claimed_new: Optional[int] = None) -> tuple:
    """Return (verdict, diff_message). `claimed_new` is what the workflow said it wrote, if it said."""
    reasons: List[str] = []
    min_new = int(expectations.get("min_new_records", 1) or 0)
    mode = expectations.get("growth_mode") or "growth"
    required = [f.strip() for f in expectations.get("required_fields", []) if f.strip()]
    non_empty = [f.strip() for f in expectations.get("non_empty_fields", []) if f.strip()]

    prev_last = prev_passes[-1] if prev_passes else None
    prev_count = prev_last["fingerprint"]["record_count"] if prev_last else 0
    delta = fp["record_count"] - prev_count if prev_last else fp["record_count"]

    if mode == "steady":
        if prev_last and delta != 0:
            reasons.append(f"the destination changed by {delta:+d} records (expected no change)")
    elif mode == "claimed" and claimed_new is None:
        reasons.append('your workflow sent no record count (this Check expects {"wrote": N} in the webhook body)')
    elif claimed_new is not None:
        if prev_last and delta < claimed_new:
            reasons.append(f"your workflow said it wrote {claimed_new} records; the destination gained {delta}")
        elif not prev_last and fp["record_count"] < claimed_new:
            reasons.append(f"your workflow said it wrote {claimed_new} records; the destination has only {fp['record_count']}")
    elif prev_last and delta < min_new:
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

    # non-empty check: the newest record must be non-empty AND so must the majority
    # of the newest window, so one odd row does not flip the verdict
    notes: List[str] = []
    newest = fp.get("newest_record") or {}
    window = fp.get("newest_window") or ([newest] if newest else [])
    if non_empty and not fp.get("newest_defined", True):
        notes.append("Newest-record checks were skipped: add ORDER BY <timestamp column> DESC to the query to enable them.")
    elif window:
        for f in non_empty:
            if f not in fp["fields"] or not _is_empty(newest.get(f)):
                continue
            empties = sum(1 for r in window if _is_empty((r or {}).get(f)))
            if len(window) == 1:
                reasons.append(f"the field `{f}` is empty in the newest record")
            elif empties * 2 > len(window):
                reasons.append(f"the field `{f}` is empty in {empties} of the {len(window)} newest records")

    suffix = (" " + " ".join(notes)) if notes else ""
    if reasons:
        return "FAIL", "Run reported success, but " + _human_join(reasons) + "." + suffix
    if not prev_last:
        return "PASS", f"First successful check. Destination has {fp['record_count']} records across {len(fp['fields'])} fields." + suffix
    if mode == "steady":
        return "PASS", f"Destination unchanged at {fp['record_count']} records. All expectations met." + suffix
    if claimed_new is not None:
        return "PASS", f"Destination gained {delta} record(s), matching what your workflow reported." + suffix
    return "PASS", f"Destination gained {delta} record(s). All expectations met." + suffix

def _annotate_count(message: str, meta: dict) -> str:
    """Append what the count means when it is not a plain true count."""
    if meta.get("capped"):
        message += f" Count capped at {AIRTABLE_MAX_RECORDS:,} records."
    if meta.get("count_estimated"):
        message += " Count estimated from the sample (the full count timed out)."
    return message


def _meta(total: int, capped: bool = False, count_estimated: bool = False, newest_defined: bool = True) -> dict:
    return {"total": total, "capped": capped, "count_estimated": count_estimated, "newest_defined": newest_defined}


async def _fetch_records(kind: str, cfg: dict):
    """Return (records, meta, error_message, error_details).

    `records` is the sample to fingerprint; `meta["total"]` is the true record
    count (`capped` when a ceiling stopped the read, `count_estimated` when the
    count fell back to the sample length). If records is None, error_message is set.
    """
    if kind == "http_json":
        url = cfg.get("url")
        headers = {}
        enc = cfg.get("bearer_token_encrypted")
        if enc:
            plain = decrypt_secret(enc)
            if plain:
                headers["Authorization"] = f"Bearer {plain}"
        json_path = cfg.get("json_path") or None
        violation = _egress_violation(url or "")
        if violation:
            return None, None, violation, None
        async with _http_client() as hc:
            async with hc.stream("GET", url, headers=headers) as resp:
                if resp.status_code >= 400:
                    err_body = (await resp.aread())[:500].decode("utf-8", errors="replace")
                    return None, None, f"Destination fetch failed with HTTP {resp.status_code}.", err_body
                chunks: List[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        return None, None, f"Destination response exceeded {MAX_RESPONSE_BYTES // (1024 * 1024)} MB.", None
                    chunks.append(chunk)
        try:
            body = json.loads(b"".join(chunks))
        except Exception:
            return None, None, "Destination did not return valid JSON.", None
        records = _get_records(body, json_path)
        if records is None:
            return None, None, f"Could not find an array of records at path `{json_path or '(root)'}`.", None
        newest_key = cfg.get("newest_key") or None
        # newest-first: by the configured key, else the endpoint's last element (documented default)
        ordered = _sort_desc(records, newest_key) if newest_key else list(reversed(records))
        return ordered, _meta(len(records)), None, None

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
        url = f"https://api.airtable.com/v0/{base_id}/{quote(table, safe='')}"
        params: dict = {"pageSize": AIRTABLE_PAGE_SIZE}
        if view:
            params["view"] = view
        flat: List[dict] = []
        capped = False
        offset: Optional[str] = None
        started = time.monotonic()
        async with _http_client() as hc:
            while True:
                if offset:
                    params["offset"] = offset
                resp = await hc.get(url, headers=headers, params=params)
                if resp.status_code >= 400:
                    return None, None, f"Airtable fetch failed with HTTP {resp.status_code}.", resp.text[:500]
                try:
                    body = resp.json()
                except Exception:
                    return None, None, "Airtable did not return valid JSON.", None
                raw = body.get("records") if isinstance(body, dict) else None
                if not isinstance(raw, list):
                    return None, None, "Airtable response is missing the `records` array.", None
                for r in raw:
                    if not isinstance(r, dict):
                        continue
                    row = {"id": r.get("id"), "createdTime": r.get("createdTime")}
                    fields = r.get("fields") or {}
                    if isinstance(fields, dict):
                        row.update(fields)
                    flat.append(row)
                offset = body.get("offset") if isinstance(body, dict) else None
                if not offset:
                    break
                if len(flat) >= AIRTABLE_MAX_RECORDS or (time.monotonic() - started) > AIRTABLE_FETCH_BUDGET_S:
                    capped = True
                    break
        if capped:
            flat = flat[:AIRTABLE_MAX_RECORDS]
        flat = _sort_desc(flat, "createdTime")
        return flat, _meta(len(flat), capped=capped), None, None

    if kind == "postgres":
        dsn_enc = cfg.get("dsn_encrypted")
        query = cfg.get("query")
        if not dsn_enc or not query:
            return None, None, "Postgres config is missing DSN or query.", None
        dsn = decrypt_secret(dsn_enc)
        violation = _egress_violation(dsn)
        if violation:
            return None, None, violation, None
        conn = None
        total: Optional[int] = None
        count_estimated = False
        try:
            conn = await asyncpg.connect(dsn=dsn, timeout=15.0)
            # Enforce read-only at the session level as a second line of defence
            await conn.execute("SET default_transaction_read_only = on")
            # True count first, on its own timeout; fall back to the sample length if it is too slow
            await conn.execute(f"SET statement_timeout = {int(PG_COUNT_TIMEOUT_MS)}")
            try:
                total = int(await conn.fetchval(f"SELECT COUNT(*) FROM ({query}) AS _vr"))
            except asyncpg.QueryCanceledError:
                count_estimated = True
            await conn.execute(f"SET statement_timeout = {int(PG_SAMPLE_TIMEOUT_MS)}")
            rows = await conn.fetch(f"SELECT * FROM ({query}) AS _vr LIMIT {PG_SAMPLE_LIMIT}")
        except asyncpg.PostgresError as e:
            return None, None, f"Postgres query failed: {type(e).__name__}.", str(e)[:500]
        except Exception as e:
            return None, None, f"Postgres connection error: {type(e).__name__}.", str(e)[:500]
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
        if total is None:
            total = len(flat)
        return flat, _meta(total, count_estimated=count_estimated, newest_defined=_has_order_by(query)), None, None

    return None, None, f"Unknown connector kind: {kind}", None


async def execute_check(check_id: str, trigger: str, run_id: str, is_retry: bool = False,
                        claimed_new: Optional[int] = None, body_note: Optional[str] = None):
    c = await db.checks.find_one({"id": check_id})
    if not c:
        return
    kind = c.get("connector_kind", "http_json")
    cfg = c.get("config", {}) or {}
    expectations = c.get("expectations", {}) or {}

    verdict = "FAIL"
    message = ""
    fp: dict = {"record_count": 0, "sample_size": 0, "fields": [], "newest_record": None, "null_pct": {}}
    error_details: Optional[str] = None
    meta: dict = _meta(0)

    try:
        records, fetched_meta, err_msg, err_body = await _fetch_records(kind, cfg)
        if records is None:
            verdict = "FAIL"
            message = err_msg or "Destination fetch failed."
            error_details = err_body
        else:
            meta = fetched_meta or _meta(len(records))
            fp = _fingerprint(records, meta["total"], newest_defined=meta.get("newest_defined", True))
            prev = await db.check_runs.find(
                {"check_id": check_id, "verdict": "PASS"}, {"_id": 0}
            ).sort("timestamp", -1).limit(30).to_list(30)
            prev.reverse()
            verdict, message = _compute_verdict(fp, prev, expectations, claimed_new)
            message = _annotate_count(message, meta)
    except httpx.HTTPError as e:
        verdict = "FAIL"
        message = f"Destination fetch error: {type(e).__name__}."
        error_details = str(e)[:500]
    except Exception as e:
        verdict = "FAIL"
        message = f"Unexpected error while checking destination: {type(e).__name__}."
        error_details = str(e)[:500]
        log.exception("execute_check error")

    stored_fp, sample = _split_sample(fp, error_details, bool(c.get("store_samples", False)))
    run_doc = {
        "id": run_id,
        "check_id": check_id,
        "timestamp": now_iso(),
        "trigger": trigger,
        "verdict": verdict,
        "diff_message": message,
        "fingerprint": stored_fp,
        "error_details": None,  # upstream bodies live in the sample, only when opted in
        "is_retry": is_retry,
        "count_capped": bool(meta.get("capped")),
        "count_estimated": bool(meta.get("count_estimated")),
        "claimed_new": claimed_new,
        "body_note": body_note,
    }
    await db.check_runs.insert_one(run_doc)
    if sample:
        await db.run_samples.insert_one({
            "run_id": run_id, "check_id": check_id,
            **{k: v for k, v in sample.items() if k != "expires_at"},
            "expires_at": datetime.fromisoformat(sample["expires_at"]),  # BSON date for the TTL index
        })

    # Decide alert routing (retry + snooze aware) — never let alert paths fail the run
    try:
        last_alerted = c.get("last_alerted_verdict")
        snoozed = bool(c.get("snooze_until") and c["snooze_until"] > now_iso())
        would_be_fresh_fail = (verdict == "FAIL" and last_alerted != "FAIL")
        retry_enabled = c.get("retry_before_alert", True)
        if (not is_retry) and would_be_fresh_fail and retry_enabled and not snoozed:
            # Retry once before waking anyone — schedule a delayed re-run
            asyncio.create_task(_schedule_retry(check_id, claimed_new))
        else:
            await _maybe_alert(c, run_doc, snoozed=snoozed)
    except Exception:
        log.exception("post-run alert routing failed for run %s", run_id)


async def _schedule_retry(check_id: str, claimed_new: Optional[int] = None):
    try:
        await asyncio.sleep(RETRY_DELAY_SECONDS)
        # the retry re-checks the same workflow run, so it carries the same claim
        await execute_check(check_id, "retry", str(uuid.uuid4()), is_retry=True, claimed_new=claimed_new)
    except Exception:
        log.exception("retry scheduling failed for check %s", check_id)


def _channels(check_doc: dict) -> List[dict]:
    """Every alert channel on a Check, legacy Slack field first, targets decrypted."""
    out: List[dict] = []
    slack_enc = check_doc.get("alert_slack_webhook_encrypted")
    if slack_enc:
        target = decrypt_secret(slack_enc)
        if target:
            out.append({"id": "legacy-slack", "kind": "slack", "target": target})
    for ch in check_doc.get("alert_channels") or []:
        target = decrypt_secret(ch.get("target_encrypted", ""))
        if target:
            out.append({"id": ch["id"], "kind": ch["kind"], "target": target})
    return out


async def _deliver(kind: str, target: str, text: str, subject: str = "") -> bool:
    """Send one alert to one channel. Returns True on a 2xx from the provider."""
    try:
        async with _http_client() as hc:
            if kind == "slack":
                resp = await hc.post(target, json={"text": text})
            elif kind == "discord":
                resp = await hc.post(target, json={"content": text[:DISCORD_MAX_CHARS]})
            elif kind == "email":
                if not _email_available():
                    return False
                resp = await hc.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                    json={"from": ALERT_FROM, "to": [target], "subject": subject, "text": text},
                )
            else:
                return False
        if resp.status_code >= 400:
            log.warning("%s alert non-2xx: %s %s", kind, resp.status_code, resp.text[:200])
            return False
        return True
    except Exception:
        log.exception("%s alert delivery failed", kind)
        return False


async def _maybe_alert(check_doc: dict, run: dict, snoozed: bool = False, database=None):
    """Alert on state transitions using last_alerted_verdict tracked on the check."""
    d = database if database is not None else db
    channels = _channels(check_doc)
    if not channels:
        return
    if snoozed:
        log.info("alerts snoozed for check %s until %s", check_doc.get("id"), check_doc.get("snooze_until"))
        return

    verdict = run["verdict"]
    # Re-read the check to get the latest last_alerted_verdict (a concurrent retry may have updated it)
    fresh = await d.checks.find_one({"id": check_doc["id"]}, {"_id": 0, "last_alerted_verdict": 1})
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

    app_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    detail_link = f"{app_url}/checks/{check_doc['id']}" if app_url else ""
    text = f"{header}\n{run['diff_message']}\n_At {run['timestamp']}_"
    plain_header = header.replace("*", "").split(" ", 1)[-1]  # e.g. "FAIL — orders-sync"
    subject = f"VerifyRuns: {plain_header}"
    sent: List[dict] = []
    for ch in channels:
        body = text
        if ch["kind"] == "slack" and detail_link:
            body += f"\n<{detail_link}|Open in VerifyRuns>"
        elif ch["kind"] in ("discord", "email") and detail_link:
            body += f"\n{detail_link}"
        ok = await _deliver(ch["kind"], ch["target"], body, subject=subject)
        sent.append({"kind": ch["kind"], "ok": ok})
    # Persist state only after delivery attempts so we never dedup a truly un-sent alert
    await d.checks.update_one({"id": check_doc["id"]}, {"$set": {"last_alerted_verdict": new_last_alerted}})
    await d.check_runs.update_one({"id": run["id"]}, {"$set": {"alerts_sent": sent}})

# ---------- Heartbeat ("did it run at all?") ----------
HEARTBEAT_TICK_SECONDS = int(os.environ.get("VR_HEARTBEAT_TICK_SECONDS", "60"))
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
ALERT_FROM = os.environ.get("ALERT_FROM", "")
DISCORD_MAX_CHARS = 2000
EMAIL_NOT_CONFIGURED = "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM)."


def _email_available() -> bool:
    return bool(RESEND_API_KEY and ALERT_FROM)


def _new_channel(kind: str, target: str) -> dict:
    return {"id": str(uuid.uuid4()), "kind": kind, "target_encrypted": encrypt_secret(target.strip()), "created_at": now_iso()}


def _sanitize_channel(ch: dict) -> dict:
    return {"id": ch["id"], "kind": ch["kind"], "last4": mask_token(decrypt_secret(ch.get("target_encrypted", "")))}


def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _heartbeat_due(heartbeat_hours: Optional[int], anchor_ts: str, last_heartbeat_ts: Optional[str], now: datetime) -> bool:
    """Due when the last real run is older than the window AND no heartbeat run
    has been recorded inside the current window."""
    if not heartbeat_hours:
        return False
    window = timedelta(hours=heartbeat_hours)
    if now - _parse_ts(anchor_ts) <= window:
        return False
    if last_heartbeat_ts and now - _parse_ts(last_heartbeat_ts) <= window:
        return False
    return True


def _heartbeat_message(elapsed_hours: float, heartbeat_hours: int) -> str:
    return f"No run in {int(round(elapsed_hours))} h — expected one every {heartbeat_hours} h."


async def _heartbeat_tick(now: Optional[datetime] = None, database=None) -> int:
    """Insert a heartbeat FAIL run for every Check whose window has lapsed. Returns how many.
    `database` lets tests drive the tick against an explicit handle."""
    now = now or datetime.now(timezone.utc)
    d = database if database is not None else db
    fired = 0
    cursor = d.checks.find({"heartbeat_hours": {"$gt": 0}})
    async for c in cursor:
        check_id = c["id"]
        last_real = await d.check_runs.find_one(
            {"check_id": check_id, "trigger": {"$ne": "heartbeat"}}, {"_id": 0, "timestamp": 1},
            sort=[("timestamp", -1)],
        )
        anchor_ts = last_real["timestamp"] if last_real else c.get("created_at") or now_iso()
        last_hb = await d.check_runs.find_one(
            {"check_id": check_id, "trigger": "heartbeat"}, {"_id": 0, "heartbeat_at": 1, "timestamp": 1},
            sort=[("heartbeat_at", -1)],
        )
        last_hb_ts = (last_hb or {}).get("heartbeat_at") or (last_hb or {}).get("timestamp")
        if not _heartbeat_due(c["heartbeat_hours"], anchor_ts, last_hb_ts, now):
            continue
        elapsed_h = (now - _parse_ts(anchor_ts)).total_seconds() / 3600.0
        run_doc = {
            "id": str(uuid.uuid4()),
            "check_id": check_id,
            "timestamp": now_iso(),
            "heartbeat_at": now.isoformat(),
            "trigger": "heartbeat",
            "verdict": "FAIL",
            "diff_message": _heartbeat_message(elapsed_h, c["heartbeat_hours"]),
            "fingerprint": {"record_count": 0, "sample_size": 0, "fields": [], "newest_hash": None,
                            "sample_stored": False, "newest_defined": True, "null_pct": {}},
            "error_details": None,
            "is_retry": False,
            "count_capped": False,
            "count_estimated": False,
            "claimed_new": None,
            "body_note": None,
        }
        await d.check_runs.insert_one(run_doc)
        fired += 1
        try:
            snoozed = bool(c.get("snooze_until") and c["snooze_until"] > now_iso())
            await _maybe_alert(c, run_doc, snoozed=snoozed, database=d)
        except Exception:
            log.exception("heartbeat alert routing failed for check %s", check_id)
    return fired


async def _heartbeat_loop():
    while True:
        try:
            fired = await _heartbeat_tick()
            if fired:
                log.info("heartbeat tick: %d missed-window run(s) recorded", fired)
        except Exception:
            log.exception("heartbeat tick failed")
        await asyncio.sleep(HEARTBEAT_TICK_SECONDS)


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
    await db.run_samples.create_index("run_id", unique=True)
    await db.run_samples.create_index("expires_at", expireAfterSeconds=0)
    app.state.heartbeat_task = asyncio.create_task(_heartbeat_loop())

@app.on_event("shutdown")
async def on_stop():
    task = getattr(app.state, "heartbeat_task", None)
    if task:
        task.cancel()
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
