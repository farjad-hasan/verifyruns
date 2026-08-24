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

app = FastAPI(title="RunProof API")
api = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("runproof")

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
    config: HttpConfig
    expectations: Expectations = Expectations()

class CheckUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[HttpConfig] = None
    expectations: Optional[Expectations] = None

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
def _sanitize_check(doc: dict, include_webhook_secret: bool = True) -> dict:
    doc.pop("_id", None)
    cfg = doc.get("config", {}) or {}
    # never leak encrypted or plaintext token
    enc = cfg.pop("bearer_token_encrypted", None)
    if enc:
        cfg["bearer_token_last4"] = mask_token(decrypt_secret(enc))
        cfg["has_bearer_token"] = True
    else:
        cfg["has_bearer_token"] = False
    doc["config"] = cfg
    if not include_webhook_secret:
        doc.pop("webhook_secret", None)
    return doc

@api.post("/checks")
async def create_check(payload: CheckCreate, user: dict = Depends(get_current_user)):
    cid = str(uuid.uuid4())
    cfg = payload.config.model_dump()
    plain_token = cfg.pop("bearer_token", None)
    if plain_token:
        cfg["bearer_token_encrypted"] = encrypt_secret(plain_token)
    doc = {
        "id": cid,
        "user_id": user["id"],
        "name": payload.name,
        "connector_kind": payload.connector_kind,
        "config": cfg,
        "expectations": payload.expectations.model_dump(),
        "webhook_secret": secrets.token_urlsafe(32),
        "created_at": now_iso(),
    }
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
    if payload.config is not None:
        cfg = payload.config.model_dump()
        plain_token = cfg.pop("bearer_token", None)
        if plain_token:
            cfg["bearer_token_encrypted"] = encrypt_secret(plain_token)
        elif c.get("config", {}).get("bearer_token_encrypted"):
            cfg["bearer_token_encrypted"] = c["config"]["bearer_token_encrypted"]
        updates["config"] = cfg
    if updates:
        await db.checks.update_one({"id": check_id}, {"$set": updates})
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

async def execute_check(check_id: str, trigger: str, run_id: str):
    c = await db.checks.find_one({"id": check_id})
    if not c:
        return
    cfg = c.get("config", {})
    url = cfg.get("url")
    token_cipher = cfg.get("bearer_token_encrypted")
    json_path = cfg.get("json_path") or None
    expectations = c.get("expectations", {}) or {}

    verdict = "FAIL"
    message = ""
    fp: dict = {"record_count": 0, "fields": [], "newest_record": None, "null_pct": {}}
    error_details: Optional[str] = None

    try:
        headers = {}
        if token_cipher:
            plain = decrypt_secret(token_cipher)
            if plain:
                headers["Authorization"] = f"Bearer {plain}"
        async with httpx.AsyncClient(timeout=20.0) as hc:
            resp = await hc.get(url, headers=headers)
        if resp.status_code >= 400:
            verdict = "FAIL"
            message = f"Destination fetch failed with HTTP {resp.status_code}."
            error_details = resp.text[:500]
        else:
            try:
                body = resp.json()
            except Exception:
                verdict = "FAIL"
                message = "Destination did not return valid JSON."
                body = None
            if body is not None:
                records = _get_records(body, json_path)
                if records is None:
                    verdict = "FAIL"
                    message = f"Could not find an array of records at path `{json_path or '(root)'}`."
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
    }
    await db.check_runs.insert_one(run_doc)

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
    return {"app": "RunProof", "ok": True}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
