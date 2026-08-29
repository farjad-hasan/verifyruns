/** Check model: validation + encryption of connector config, D1 row ↔ document, sanitising for clients. */
import { decryptSecret, encryptSecret, MASK, maskQueryValues, maskToken } from "./crypto";
import { egressViolation } from "./egress";
import { Env, flag, nowIso } from "./env";
import { HttpError, validation } from "./http";
import { Expectations } from "./validate";

export interface Channel {
  id: string;
  kind: "slack" | "discord" | "email";
  target_encrypted: string;
  created_at: string;
}

export interface CheckDoc {
  id: string;
  user_id: string;
  name: string;
  connector_kind: string;
  config: Record<string, any>;
  expectations: Expectations;
  webhook_secret: string;
  created_at: string;
  retry_before_alert: boolean;
  heartbeat_hours: number | null;
  store_samples: boolean;
  alert_slack_webhook_encrypted: string | null;
  alert_channels: Channel[];
  public_token: string | null;
  snooze_until: string | null;
  last_alerted_verdict: string | null;
  pending_retry: { due_at: string; claimed_new: number | null } | null;
  pending_runs: { run_id: string; claimed_new: number | null; body_note: string | null; queued_at: string }[];
}

export function rowToCheck(row: any): CheckDoc {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    connector_kind: row.connector_kind,
    config: JSON.parse(row.config || "{}"),
    expectations: JSON.parse(row.expectations || "{}"),
    webhook_secret: row.webhook_secret,
    created_at: row.created_at,
    retry_before_alert: !!row.retry_before_alert,
    heartbeat_hours: row.heartbeat_hours ?? null,
    store_samples: !!row.store_samples,
    alert_slack_webhook_encrypted: row.alert_slack_webhook_encrypted ?? null,
    alert_channels: JSON.parse(row.alert_channels || "[]"),
    public_token: row.public_token ?? null,
    snooze_until: row.snooze_until ?? null,
    last_alerted_verdict: row.last_alerted_verdict ?? null,
    pending_retry: row.pending_retry ? JSON.parse(row.pending_retry) : null,
    pending_runs: JSON.parse(row.pending_runs || "[]"),
  };
}

const BANNED = ["INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "TRUNCATE ", "GRANT ", "REVOKE ", "CREATE ", "COMMENT "];

/** Validate + normalise a connector config, encrypting secrets and keeping stored ones when omitted. */
export async function prepareConfigForStorage(env: Env, kind: string, cfgIn: any, existing: Record<string, any> = {}): Promise<Record<string, any>> {
  const allowPrivate = flag(env.VR_ALLOW_PRIVATE_EGRESS, false);
  const cfg = cfgIn && typeof cfgIn === "object" ? cfgIn : {};
  if (kind === "http_json") {
    // Like the secrets below, an omitted url keeps the stored one; a url carrying the mask is the
    // sanitised value echoed back by a client and must never overwrite the real destination.
    const url: unknown = typeof cfg.url === "string" && cfg.url.trim() ? cfg.url.trim() : existing.url;
    if (typeof url !== "string" || !url) throw new HttpError(400, "config.url is required for http_json");
    if (url.includes(MASK)) throw validation("config.url contains a masked value; send the full URL or omit config.url to keep the stored one", ["body", "config", "url"]);
    const v = egressViolation(url, allowPrivate);
    if (v) throw new HttpError(400, v);
    const out: Record<string, any> = { url, json_path: cfg.json_path || null, newest_key: (cfg.newest_key || "").trim() || null };
    if (cfg.bearer_token) out.bearer_token_encrypted = await encryptSecret(env.ENC_KEY, cfg.bearer_token);
    else if (existing.bearer_token_encrypted) out.bearer_token_encrypted = existing.bearer_token_encrypted;
    return out;
  }
  if (kind === "airtable") {
    if (typeof cfg.base_id !== "string" || !cfg.base_id.trim()) throw new HttpError(400, "config.base_id is required for airtable");
    if (typeof cfg.table !== "string" || !cfg.table.trim()) throw new HttpError(400, "config.table is required for airtable");
    const out: Record<string, any> = { base_id: cfg.base_id.trim(), table: cfg.table.trim(), view: cfg.view || null };
    if (cfg.personal_access_token) out.pat_encrypted = await encryptSecret(env.ENC_KEY, cfg.personal_access_token);
    else if (existing.pat_encrypted) out.pat_encrypted = existing.pat_encrypted;
    return out;
  }
  if (kind === "postgres") {
    if (typeof cfg.query !== "string" || !cfg.query.trim()) throw new HttpError(400, "config.query is required for postgres");
    const q = cfg.query.trim().replace(/;+$/, "").trim();
    const upper = q.toUpperCase();
    if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) throw new HttpError(400, "postgres query must start with SELECT or WITH");
    if (q.includes(";")) throw new HttpError(400, "postgres query must be a single statement (no semicolons)");
    if (BANNED.some((b) => upper.includes(b))) throw new HttpError(400, "postgres query is not read-only");
    const out: Record<string, any> = { query: q };
    if (cfg.dsn) {
      if (typeof cfg.dsn !== "string" || !cfg.dsn.trim()) throw new HttpError(400, "config.dsn is required for postgres");
      const v = egressViolation(cfg.dsn.trim(), allowPrivate);
      if (v) throw new HttpError(400, v);
      out.dsn_encrypted = await encryptSecret(env.ENC_KEY, cfg.dsn.trim());
    } else if (existing.dsn_encrypted) out.dsn_encrypted = existing.dsn_encrypted;
    else throw new HttpError(400, "config.dsn is required for postgres");
    return out;
  }
  throw new HttpError(400, `Unknown connector kind: ${kind}`);
}

async function sanitizeConfig(env: Env, kind: string, cfg: Record<string, any>): Promise<Record<string, any>> {
  const out = { ...cfg };
  if (kind === "http_json" && typeof out.url === "string") out.url = maskQueryValues(out.url);
  const pairs: Record<string, [string, string, string]> = {
    http_json: ["bearer_token_encrypted", "has_bearer_token", "bearer_token_last4"],
    airtable: ["pat_encrypted", "has_pat", "pat_last4"],
    postgres: ["dsn_encrypted", "has_dsn", "dsn_last4"],
  };
  const p = pairs[kind];
  if (p) {
    const enc = out[p[0]];
    delete out[p[0]];
    out[p[1]] = !!enc;
    if (enc) out[p[2]] = maskToken(await decryptSecret(env.ENC_KEY, enc));
  }
  return out;
}

export async function sanitizeChannel(env: Env, ch: Channel): Promise<{ id: string; kind: string; last4: string }> {
  return { id: ch.id, kind: ch.kind, last4: maskToken(await decryptSecret(env.ENC_KEY, ch.target_encrypted)) };
}

export async function sanitizeCheck(env: Env, c: CheckDoc, includeWebhookSecret = true): Promise<Record<string, any>> {
  const channels: { id: string; kind: string; last4: string }[] = [];
  let has_alert_slack = false;
  let alert_slack_last4: string | undefined;
  if (c.alert_slack_webhook_encrypted) {
    has_alert_slack = true;
    alert_slack_last4 = maskToken(await decryptSecret(env.ENC_KEY, c.alert_slack_webhook_encrypted));
    channels.push({ id: "legacy-slack", kind: "slack", last4: alert_slack_last4 });
  }
  for (const ch of c.alert_channels) channels.push(await sanitizeChannel(env, ch));
  const doc: Record<string, any> = {
    id: c.id,
    user_id: c.user_id,
    name: c.name,
    connector_kind: c.connector_kind,
    config: await sanitizeConfig(env, c.connector_kind, c.config),
    expectations: c.expectations,
    created_at: c.created_at,
    retry_before_alert: c.retry_before_alert,
    heartbeat_hours: c.heartbeat_hours,
    store_samples: c.store_samples,
    has_alert_slack,
    alert_channels: channels,
    is_public: !!c.public_token,
    public_token: c.public_token ?? undefined,
    snooze_until: c.snooze_until ?? undefined,
    is_snoozed: !!(c.snooze_until && c.snooze_until > nowIso()),
    last_alerted_verdict: c.last_alerted_verdict ?? undefined,
    pending_retry_at: c.pending_retry?.due_at ?? null,
    pending_runs: c.pending_runs.length,
  };
  if (alert_slack_last4) doc.alert_slack_last4 = alert_slack_last4;
  if (includeWebhookSecret) doc.webhook_secret = c.webhook_secret;
  for (const k of Object.keys(doc)) if (doc[k] === undefined) delete doc[k];
  return doc;
}

// ---------- D1 access ----------

export async function getCheck(env: Env, id: string): Promise<CheckDoc | null> {
  const row = await env.DB.prepare("SELECT * FROM checks WHERE id = ?").bind(id).first();
  return row ? rowToCheck(row) : null;
}

export async function getCheckForUser(env: Env, id: string, userId: string): Promise<CheckDoc> {
  const row = await env.DB.prepare("SELECT * FROM checks WHERE id = ? AND user_id = ?").bind(id, userId).first();
  if (!row) throw new HttpError(404, "Check not found");
  return rowToCheck(row);
}

export async function insertCheck(env: Env, c: CheckDoc): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO checks (id, user_id, name, connector_kind, config, expectations, webhook_secret, created_at,
       retry_before_alert, heartbeat_hours, store_samples, alert_slack_webhook_encrypted, alert_channels,
       public_token, snooze_until, last_alerted_verdict, pending_retry, pending_runs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      c.id, c.user_id, c.name, c.connector_kind, JSON.stringify(c.config), JSON.stringify(c.expectations), c.webhook_secret, c.created_at,
      c.retry_before_alert ? 1 : 0, c.heartbeat_hours, c.store_samples ? 1 : 0, c.alert_slack_webhook_encrypted, JSON.stringify(c.alert_channels),
      c.public_token, c.snooze_until, c.last_alerted_verdict, c.pending_retry ? JSON.stringify(c.pending_retry) : null, JSON.stringify(c.pending_runs),
    )
    .run();
}

/** Set scalar/JSON columns; values that are objects/arrays are JSON-encoded, booleans become 0/1. */
export async function updateCheck(env: Env, id: string, patch: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const vals = cols.map((c) => {
    const v = patch[c];
    if (typeof v === "boolean") return v ? 1 : 0;
    if (v !== null && typeof v === "object") return JSON.stringify(v);
    return v ?? null;
  });
  await env.DB.prepare(`UPDATE checks SET ${sets} WHERE id = ?`).bind(...vals, id).run();
}

export async function deleteCheckCascade(env: Env, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM run_samples WHERE check_id = ?").bind(id),
    env.DB.prepare("DELETE FROM check_runs WHERE check_id = ?").bind(id),
    env.DB.prepare("DELETE FROM checks WHERE id = ?").bind(id),
  ]);
}
