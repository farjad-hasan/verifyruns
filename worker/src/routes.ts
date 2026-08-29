/** HTTP handlers — same paths, payloads, status codes and messages as backend/server.py. */
import { CheckDoc, deleteCheckCascade, getCheckForUser, insertCheck, prepareConfigForStorage, rowToCheck, sanitizeChannel, sanitizeCheck, updateCheck } from "./checks";
import { encryptSecret, hashPassword, signJwt, tokenUrlsafe, uuid, verifyJwt, verifyPassword } from "./crypto";
import { emailAvailable, Env, flag, nowIso, num } from "./env";
import { clientIp, HttpError, json, readJson, validation } from "./http";
import { PLAN_IDS, PLANS } from "./plans";
import { CONNECTOR_KINDS, isEmail, parseChannel, parseExpectations, parseHeartbeat, parseName, validateChannelTarget } from "./validate";
import { RateLimiter } from "./egress";

export const EMAIL_NOT_CONFIGURED = "Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM).";
const JWT_EXPIRE_DAYS = 7;

// Best-effort, per isolate (see the egress-policy spec delta)
const limiters: { auth?: RateLimiter; hook?: RateLimiter; create?: RateLimiter } = {};
export function limiter(env: Env, which: "auth" | "hook" | "create"): RateLimiter {
  if (!limiters[which]) {
    const dflt = which === "create" ? 60 : 120;
    const key = which === "auth" ? env.VR_RATE_AUTH_PER_MIN : which === "hook" ? env.VR_RATE_HOOK_PER_MIN : env.VR_RATE_CREATE_PER_MIN;
    limiters[which] = new RateLimiter(num(key, dflt));
  }
  return limiters[which]!;
}
export function enforce(rl: RateLimiter, key: string): void {
  if (!rl.allow(key)) throw new HttpError(429, "Too many requests", { "retry-after": String(rl.retryAfter(key)) });
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export async function currentUser(env: Env, request: Request): Promise<User> {
  const auth = request.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new HttpError(401, "Not authenticated");
  const res = await verifyJwt(m[1], env.JWT_SECRET);
  if (!res.ok) throw new HttpError(401, res.reason === "expired" ? "Token expired" : "Invalid token");
  const row = await env.DB.prepare("SELECT id, email, created_at FROM users WHERE id = ?").bind(res.payload.sub).first<User>();
  if (!row) throw new HttpError(401, "User not found");
  return row;
}

async function makeToken(env: Env, userId: string, email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + JWT_EXPIRE_DAYS * 86400;
  return signJwt({ sub: userId, email, exp }, env.JWT_SECRET);
}

// ---------- auth ----------

export async function register(env: Env, request: Request): Promise<Response> {
  enforce(limiter(env, "auth"), clientIp(request));
  const body = await readJson(request);
  if (!isEmail(body?.email)) throw validation("value is not a valid email address", ["body", "email"]);
  if (typeof body.password !== "string" || body.password.length < 6) throw validation("ensure this value has at least 6 characters", ["body", "password"]);
  const email = body.email.toLowerCase().trim();
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) throw new HttpError(400, "Email already registered");
  const id = uuid();
  const hash = await hashPassword(body.password, num(env.VR_PBKDF2_ITERATIONS, 100000));
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(id, email, hash, nowIso()).run();
  return json({ token: await makeToken(env, id, email), user: { id, email } });
}

export async function login(env: Env, request: Request): Promise<Response> {
  enforce(limiter(env, "auth"), clientIp(request));
  const body = await readJson(request);
  if (!isEmail(body?.email)) throw validation("value is not a valid email address", ["body", "email"]);
  const email = body.email.toLowerCase().trim();
  const row = await env.DB.prepare("SELECT id, password_hash FROM users WHERE email = ?").bind(email).first<{ id: string; password_hash: string }>();
  if (!row || !(await verifyPassword(String(body.password ?? ""), row.password_hash))) throw new HttpError(401, "Invalid email or password");
  return json({ token: await makeToken(env, row.id, email), user: { id: row.id, email } });
}

export async function me(env: Env, request: Request): Promise<Response> {
  return json(await currentUser(env, request));
}

export async function deleteMe(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  const ids = (await env.DB.prepare("SELECT id FROM checks WHERE user_id = ?").bind(user.id).all<{ id: string }>()).results.map((r) => r.id);
  const stmts = [];
  for (const id of ids) {
    stmts.push(env.DB.prepare("DELETE FROM run_samples WHERE check_id = ?").bind(id));
    stmts.push(env.DB.prepare("DELETE FROM check_runs WHERE check_id = ?").bind(id));
  }
  stmts.push(env.DB.prepare("DELETE FROM checks WHERE user_id = ?").bind(user.id));
  stmts.push(env.DB.prepare("DELETE FROM interest WHERE user_id = ? OR email = ?").bind(user.id, user.email));
  stmts.push(env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id));
  stmts.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id));
  await env.DB.batch(stmts);
  return json({ ok: true, deleted_checks: ids.length });
}

// ---------- checks ----------

export async function createCheck(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  enforce(limiter(env, "create"), user.id);
  const body = (await readJson(request)) || {};
  const name = parseName(body.name);
  const kind = typeof body.connector_kind === "string" ? body.connector_kind : "http_json";
  const expectations = parseExpectations(body.expectations);
  const heartbeat = parseHeartbeat(body.heartbeat_hours);
  const config = await prepareConfigForStorage(env, kind, body.config);
  const allowPrivate = flag(env.VR_ALLOW_PRIVATE_EGRESS, false);
  const legacySlack = typeof body.alert_slack_webhook === "string" && body.alert_slack_webhook.trim() ? body.alert_slack_webhook.trim() : null;
  if (legacySlack) validateChannelTarget("slack", legacySlack, allowPrivate, ["body", "alert_slack_webhook"]);
  const channels = [];
  if (Array.isArray(body.alert_channels)) {
    for (const [i, raw] of (body.alert_channels as unknown[]).entries()) {
      const ch = parseChannel(raw);
      validateChannelTarget(ch.kind, ch.target.trim(), allowPrivate, ["body", "alert_channels", i, "target"]);
      if (ch.kind === "email" && !emailAvailable(env)) throw new HttpError(400, EMAIL_NOT_CONFIGURED);
      channels.push({ id: uuid(), kind: ch.kind, target_encrypted: await encryptSecret(env.ENC_KEY, ch.target.trim()), created_at: nowIso() });
    }
  }
  const doc: CheckDoc = {
    id: uuid(),
    user_id: user.id,
    name,
    connector_kind: kind,
    config,
    expectations,
    webhook_secret: tokenUrlsafe(32),
    created_at: nowIso(),
    retry_before_alert: body.retry_before_alert === undefined ? true : !!body.retry_before_alert,
    heartbeat_hours: heartbeat,
    store_samples: !!body.store_samples,
    alert_slack_webhook_encrypted: legacySlack ? await encryptSecret(env.ENC_KEY, legacySlack) : null,
    alert_channels: channels,
    public_token: null,
    snooze_until: null,
    last_alerted_verdict: null,
    pending_retry: null,
    pending_runs: [],
  };
  await insertCheck(env, doc);
  return json(await sanitizeCheck(env, doc));
}

export async function listChecks(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  const rows = (await env.DB.prepare("SELECT * FROM checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 500").bind(user.id).all()).results;
  const out = [];
  for (const row of rows) {
    const c = rowToCheck(row);
    const runs = (await env.DB.prepare("SELECT id, verdict, timestamp, diff_message FROM check_runs WHERE check_id = ? ORDER BY timestamp DESC LIMIT 30").bind(c.id).all()).results.reverse();
    const s = await sanitizeCheck(env, c, false);
    s.recent_runs = runs;
    s.last_verdict = runs.length ? (runs[runs.length - 1] as any).verdict : null;
    out.push(s);
  }
  return json(out);
}

export async function getCheckRoute(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  return json(await sanitizeCheck(env, await getCheckForUser(env, id, user.id)));
}

export async function patchCheck(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  const c = await getCheckForUser(env, id, user.id);
  const body = (await readJson(request)) || {};
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined && body.name !== null) patch.name = parseName(body.name);
  if (body.expectations !== undefined && body.expectations !== null) patch.expectations = parseExpectations(body.expectations);
  if (typeof body.connector_kind === "string") {
    if (!(CONNECTOR_KINDS as readonly string[]).includes(body.connector_kind)) throw new HttpError(400, `Unknown connector kind: ${body.connector_kind}`);
    if (body.connector_kind !== c.connector_kind && (body.config === undefined || body.config === null)) throw new HttpError(400, "config is required when changing connector_kind");
    patch.connector_kind = body.connector_kind;
  }
  if (body.config !== undefined && body.config !== null) {
    const kind = typeof body.connector_kind === "string" ? body.connector_kind : c.connector_kind;
    patch.config = await prepareConfigForStorage(env, kind, body.config, c.config);
  }
  if (body.retry_before_alert !== undefined && body.retry_before_alert !== null) patch.retry_before_alert = !!body.retry_before_alert;
  if ("heartbeat_hours" in body) patch.heartbeat_hours = parseHeartbeat(body.heartbeat_hours);
  if (body.store_samples !== undefined && body.store_samples !== null) patch.store_samples = !!body.store_samples;
  if (body.clear_alert_slack) patch.alert_slack_webhook_encrypted = null;
  else if (typeof body.alert_slack_webhook === "string" && body.alert_slack_webhook.trim()) {
    const target = body.alert_slack_webhook.trim();
    validateChannelTarget("slack", target, flag(env.VR_ALLOW_PRIVATE_EGRESS, false), ["body", "alert_slack_webhook"]);
    patch.alert_slack_webhook_encrypted = await encryptSecret(env.ENC_KEY, target);
  }
  await updateCheck(env, id, patch);
  return json(await sanitizeCheck(env, await getCheckForUser(env, id, user.id)));
}

export async function deleteCheck(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  await deleteCheckCascade(env, id);
  return json({ ok: true });
}

export async function snooze(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  const body = (await readJson(request)) || {};
  const hours = Number(body.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw validation("hours must be between 1 and 168", ["body", "hours"]);
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  await updateCheck(env, id, { snooze_until: until });
  return json({ snooze_until: until, is_snoozed: true });
}

export async function wake(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  await updateCheck(env, id, { snooze_until: null });
  return json({ is_snoozed: false });
}

export async function enablePublic(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  const c = await getCheckForUser(env, id, user.id);
  const token = c.public_token || tokenUrlsafe(24);
  await updateCheck(env, id, { public_token: token });
  return json({ public_token: token, is_public: true });
}

export async function disablePublic(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  await updateCheck(env, id, { public_token: null });
  return json({ is_public: false });
}

export async function publicCheck(env: Env, token: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM checks WHERE public_token = ?").bind(token).first();
  if (!row) throw new HttpError(404, "Not found");
  const c = rowToCheck(row);
  const runs = (await env.DB.prepare("SELECT id, verdict, timestamp, diff_message, trigger FROM check_runs WHERE check_id = ? ORDER BY timestamp DESC LIMIT 30").bind(c.id).all()).results;
  return json({ name: c.name, connector_kind: c.connector_kind, last_verdict: runs.length ? (runs[0] as any).verdict : null, runs });
}

// ---------- channels ----------

export async function addChannel(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  const c = await getCheckForUser(env, id, user.id);
  const ch = parseChannel(await readJson(request));
  validateChannelTarget(ch.kind, ch.target.trim(), flag(env.VR_ALLOW_PRIVATE_EGRESS, false), ["body", "target"]);
  if (ch.kind === "email" && !emailAvailable(env)) throw new HttpError(400, EMAIL_NOT_CONFIGURED);
  const doc = { id: uuid(), kind: ch.kind, target_encrypted: await encryptSecret(env.ENC_KEY, ch.target.trim()), created_at: nowIso() };
  await updateCheck(env, id, { alert_channels: [...c.alert_channels, doc] });
  return json(await sanitizeChannel(env, doc));
}

export async function deleteChannel(env: Env, request: Request, id: string, channelId: string): Promise<Response> {
  const user = await currentUser(env, request);
  const c = await getCheckForUser(env, id, user.id);
  if (channelId === "legacy-slack") {
    await updateCheck(env, id, { alert_slack_webhook_encrypted: null });
    return json({ ok: true });
  }
  const remaining = c.alert_channels.filter((x) => x.id !== channelId);
  if (remaining.length === c.alert_channels.length) throw new HttpError(404, "Channel not found");
  await updateCheck(env, id, { alert_channels: remaining });
  return json({ ok: true });
}

// ---------- runs (read) ----------

export async function listRuns(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  const limit = Math.max(1, Math.min(500, num(new URL(request.url).searchParams.get("limit") || undefined, 50)));
  const rows = (await env.DB.prepare("SELECT * FROM check_runs WHERE check_id = ? ORDER BY timestamp DESC LIMIT ?").bind(id, limit).all()).results;
  return json(rows.map(rowToRun));
}

export async function getRun(env: Env, request: Request, runId: string): Promise<Response> {
  const user = await currentUser(env, request);
  const row = await env.DB.prepare("SELECT * FROM check_runs WHERE id = ?").bind(runId).first();
  if (!row) throw new HttpError(404, "Run not found");
  const owner = await env.DB.prepare("SELECT id FROM checks WHERE id = ? AND user_id = ?").bind((row as any).check_id, user.id).first();
  if (!owner) throw new HttpError(404, "Run not found");
  const run = rowToRun(row);
  const sample = await env.DB.prepare("SELECT newest_record, newest_window, error_details, expires_at FROM run_samples WHERE run_id = ?").bind(runId).first<any>();
  if (sample) {
    run.sample = {
      newest_record: sample.newest_record ? JSON.parse(sample.newest_record) : null,
      newest_window: sample.newest_window ? JSON.parse(sample.newest_window) : [],
      error_details: sample.error_details ?? null,
      expires_at: sample.expires_at,
    };
  }
  return json(run);
}

export function rowToRun(row: any): Record<string, any> {
  return {
    id: row.id,
    check_id: row.check_id,
    timestamp: row.timestamp,
    trigger: row.trigger,
    verdict: row.verdict,
    diff_message: row.diff_message,
    fingerprint: JSON.parse(row.fingerprint || "{}"),
    error_details: row.error_details ?? null,
    is_retry: !!row.is_retry,
    count_capped: !!row.count_capped,
    count_estimated: !!row.count_estimated,
    claimed_new: row.claimed_new ?? null,
    body_note: row.body_note ?? null,
    ...(row.heartbeat_at ? { heartbeat_at: row.heartbeat_at } : {}),
    ...(row.alerts_sent ? { alerts_sent: JSON.parse(row.alerts_sent) } : {}),
  };
}

// ---------- plans / interest / meta ----------

/** For an external monitor: 503 when the cron has not ticked within the allowed age. Read before this
 *  request's own lazy tick runs (that is scheduled after the response), so a dead cron cannot hide behind the probe. */
export async function health(env: Env): Promise<Response> {
  const maxAge = num(env.VR_HEALTH_MAX_TICK_AGE_SECONDS, 600);
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'tick_last_at'").first<{ value: string }>();
  const now = Date.now();
  const last = row ? new Date(row.value).getTime() : NaN;
  const age = Number.isFinite(last) ? Math.max(0, Math.floor((now - last) / 1000)) : null;
  const ok = age !== null && age <= maxAge;
  return json({ ok, tick_age_seconds: age, max_tick_age_seconds: maxAge, checked_at: new Date(now).toISOString() }, ok ? 200 : 503);
}

export function meta(env: Env): Response {
  return json({ email_alerts: emailAvailable(env) });
}

export function plans(env: Env): Response {
  return json({ early_access: flag(env.VR_EARLY_ACCESS, true), plans: PLANS });
}

export async function interest(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  const body = (await readJson(request)) || {};
  if (!PLAN_IDS.includes(body.plan)) throw validation("plan must be free, pro or agency", ["body", "plan"]);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
  await env.DB.prepare("INSERT INTO interest (id, user_id, email, plan, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(uuid(), user.id, user.email, body.plan, note, nowIso()).run();
  return json({ ok: true, plan: body.plan });
}

// ---------- webhook + manual run ----------
import { executeCheck } from "./execute";
import { parseClaimed } from "./engine";
import { enqueueRun } from "./tick";

export async function webhook(env: Env, request: Request, ctx: ExecutionContext, secret: string): Promise<Response> {
  enforce(limiter(env, "hook"), secret);
  const row = await env.DB.prepare("SELECT id FROM checks WHERE webhook_secret = ?").bind(secret).first<{ id: string }>();
  if (!row) throw new HttpError(404, "Unknown webhook");
  let body: unknown = null;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const [claimedNew, bodyNote] = parseClaimed(body);
  const runId = uuid();
  const wait = new URL(request.url).searchParams.get("wait");
  if (wait !== null && Number(wait) === 0) {
    await enqueueRun(env, row.id, { run_id: runId, claimed_new: claimedNew, body_note: bodyNote, queued_at: nowIso() });
    return json({ accepted: true, run_id: runId, queued: true }, 202);
  }
  const run = await executeCheck(env, row.id, "webhook", runId, false, claimedNew, bodyNote);
  return json({ accepted: true, run_id: runId, verdict: run?.verdict ?? null, diff_message: run?.diff_message ?? null, timed_out: false });
}

export async function runNow(env: Env, request: Request, ctx: ExecutionContext, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  await getCheckForUser(env, id, user.id);
  const runId = uuid();
  ctx.waitUntil(executeCheck(env, id, "manual", runId).catch((e) => console.error("manual run failed", e)));
  return json({ run_id: runId, status: "queued" });
}
