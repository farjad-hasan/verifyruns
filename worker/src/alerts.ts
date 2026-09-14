/** Alert channels and transition-based delivery. Ported from backend/server.py. */
import { CheckDoc, getCheck, Channel } from "./checks";
import { decryptSecret, uuid } from "./crypto";
import { emailAlertsEnabled, emailAvailable, Env, num, nowIso } from "./env";
import { httpFetch, readCapped } from "./net";

const DISCORD_MAX_CHARS = 2000;

export interface LiveChannel {
  id: string;
  kind: "slack" | "discord" | "email";
  /** null: a target is stored but failed to decrypt — a delivery failure, not an absent channel. */
  target: string | null;
}

export async function channels(env: Env, c: CheckDoc): Promise<LiveChannel[]> {
  const out: LiveChannel[] = [];
  if (c.alert_slack_webhook_encrypted) {
    const target = await decryptSecret(env.ENC_KEY, c.alert_slack_webhook_encrypted);
    if (target !== "") out.push({ id: "legacy-slack", kind: "slack", target });
  }
  for (const ch of c.alert_channels) {
    const target = await decryptSecret(env.ENC_KEY, ch.target_encrypted);
    if (target !== "") out.push({ id: ch.id, kind: ch.kind, target });
  }
  return out;
}

export type DeliveryResult = { ok: true } | { ok: false; error: string };

export async function deliver(env: Env, kind: string, target: string, text: string, subject = ""): Promise<DeliveryResult> {
  try {
    let resp: Response;
    const init = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (kind === "slack") resp = await httpFetch(target, init({ text }));
    else if (kind === "discord") resp = await httpFetch(target, init({ content: text.slice(0, DISCORD_MAX_CHARS), allowed_mentions: { parse: [] } }));
    else if (kind === "email") {
      // Creation is gated in routes; delivery must use the same product flag so
      // pre-existing email channels do not keep sending while alerts are upcoming.
      if (!emailAlertsEnabled(env)) return { ok: false, error: "Email alerts are upcoming. Use Slack or Discord for now." };
      if (!emailAvailable(env)) return { ok: false, error: "email alerts need RESEND_API_KEY and ALERT_FROM on the server" };
      resp = await httpFetch("https://api.resend.com/emails", init({ from: env.ALERT_FROM, to: [target], subject, text }, { authorization: `Bearer ${env.RESEND_API_KEY}` }));
    } else return { ok: false, error: `unknown channel kind ${kind}` };
    // With redirect: "manual" a 3xx surfaces here as its own status; a redirecting webhook is a failure.
    if (resp.status >= 300) {
      const raw = await readCapped(resp, num(env.VR_MAX_RESPONSE_BYTES, 5 * 1024 * 1024)).catch(() => null);
      const body = raw ? new TextDecoder().decode(raw).slice(0, 300) : "";
      console.warn(`${kind} alert non-2xx: ${resp.status} ${body}`);
      return { ok: false, error: `${resp.status} ${body}`.trim() };
    }
    return { ok: true };
  } catch (e: any) {
    console.error(`${kind} alert delivery failed`, e);
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
}

export const ALERT_LEASE_MS = 60_000;
export const ALERT_RETRY_MS = 60_000;
type AlertRun = { id: string; verdict: string; diff_message: string; timestamp: string };
type Sent = { id: string; kind: string; ok: boolean; error?: string };
interface OutboxRow {
  seq: number; run_id: string; check_id: string; verdict: string; payload: string;
  results: string; attempts: number;
}

/** Include these statements in the run's transaction: there must be no committed
 * transition without its pending notification. Targets stay encrypted in the outbox. */
export function queueAlertStatements(env: Env, c: CheckDoc, run: AlertRun, snoozed: boolean, retryStartedAt: string | null = null): D1PreparedStatement[] {
  const snapshot = [...c.alert_channels];
  if (c.alert_slack_webhook_encrypted) snapshot.unshift({ id: "legacy-slack", kind: "slack", target_encrypted: c.alert_slack_webhook_encrypted, created_at: c.created_at });
  if (snoozed || !snapshot.length || !["FAIL", "PASS"].includes(run.verdict)) return [];
  const predicate = run.verdict === "FAIL" ? "(last_alerted_verdict IS NULL OR last_alerted_verdict != 'FAIL')" : "last_alerted_verdict = 'FAIL'";
  const payload = JSON.stringify({ name: c.name, message: run.diff_message, timestamp: run.timestamp, channels: snapshot });
  const enqueueToken = uuid();
  return [
    env.DB.prepare(`INSERT INTO alert_outbox (run_id, check_id, verdict, payload, next_attempt_at, enqueue_token)
      SELECT ?, id, ?, ?, ?, ? FROM checks WHERE id = ? AND ${predicate} AND EXISTS (SELECT 1 FROM check_runs WHERE id = ? AND check_id = checks.id)
      AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM check_runs WHERE check_id = checks.id AND is_retry = 0 AND trigger != 'heartbeat' AND timestamp >= ?))
      ON CONFLICT(run_id) DO NOTHING`).bind(run.id, run.verdict, payload, nowIso(), enqueueToken, c.id, run.id, retryStartedAt, retryStartedAt),
    env.DB.prepare(`UPDATE checks SET last_alerted_verdict = ? WHERE id = ? AND ${predicate}
      AND EXISTS (SELECT 1 FROM alert_outbox WHERE run_id = ? AND enqueue_token = ? AND check_id = checks.id)`).bind(run.verdict, c.id, run.id, enqueueToken),
  ];
}

/** Standalone entry for existing runs; new executions persist these statements with the run. */
export async function maybeAlert(env: Env, c: CheckDoc, run: AlertRun, snoozed: boolean): Promise<void> {
  const stmts = queueAlertStatements(env, c, run, snoozed);
  if (!stmts.length) return;
  await env.DB.batch(stmts);
  await drainAlerts(env, new Date(), c.id);
}

/** Oldest pending event per Check only, so recovery cannot overtake an undelivered FAIL.
 * Expired leases are retryable. Provider acceptance followed by a crash can duplicate
 * delivery: external HTTP and D1 cannot be committed atomically. */
export async function drainAlerts(env: Env, now = new Date(), checkId?: string): Promise<number> {
  const rows = (await env.DB.prepare(`SELECT * FROM alert_outbox AS o
    WHERE next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
      AND (? IS NULL OR check_id = ?)
      AND EXISTS (SELECT 1 FROM checks WHERE id = o.check_id AND (snooze_until IS NULL OR snooze_until <= ?))
      AND NOT EXISTS (SELECT 1 FROM alert_outbox AS earlier WHERE earlier.check_id = o.check_id AND earlier.seq < o.seq)
    ORDER BY seq LIMIT ?`).bind(now.toISOString(), now.toISOString(), checkId ?? null, checkId ?? null, now.toISOString(), Math.max(1, num(env.VR_TICK_BATCH, 25))).all<OutboxRow>()).results;
  let completed = 0;
  for (const row of rows) {
    const token = uuid();
    const claim = await env.DB.prepare(`UPDATE alert_outbox SET lease_token = ?, lease_until = ?, attempts = attempts + 1
      WHERE seq = ? AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
      AND NOT EXISTS (SELECT 1 FROM alert_outbox AS earlier WHERE earlier.check_id = alert_outbox.check_id AND earlier.seq < alert_outbox.seq)`)
      .bind(token, new Date(now.getTime() + ALERT_LEASE_MS).toISOString(), row.seq, now.toISOString(), now.toISOString()).run();
    if (!claim.meta.changes) continue;
    try {
      const c = await getCheck(env, row.check_id);
      if (!c) continue; // deletion cascades to the outbox
      if (c.snooze_until && c.snooze_until > nowIso()) {
        await env.DB.prepare("UPDATE alert_outbox SET lease_token = NULL, lease_until = NULL WHERE seq = ? AND lease_token = ?").bind(row.seq, token).run();
        continue;
      }
      const payload = JSON.parse(row.payload) as { name: string; message: string; timestamp: string; channels: Channel[] };
      const current = [...c.alert_channels];
      if (c.alert_slack_webhook_encrypted) current.push({ id: "legacy-slack", kind: "slack", target_encrypted: c.alert_slack_webhook_encrypted, created_at: c.created_at });
      const active = payload.channels.filter(ch =>
        current.some(live => live.id === ch.id && live.target_encrypted === ch.target_encrypted)
        && (ch.kind !== "email" || emailAlertsEnabled(env)));
      const sent: Sent[] = JSON.parse(row.results);
      const state: AlertState = row.verdict === "FAIL" ? "FAIL" : "Recovered";
      const link = env.PUBLIC_APP_URL ? `${env.PUBLIC_APP_URL.replace(/\/+$/, "")}/checks/${c.id}` : "";
      // A prior attempt that durably recorded acceptance already satisfies the partial-success
      // policy, even if its final delete was interrupted. Do not resend successful channels.
      if (!sent.some(s => s.ok)) for (const ch of active) {
        // Each HTTP delivery is bounded to 8 seconds, less than this renewed lease.
        const renewed = await env.DB.prepare("UPDATE alert_outbox SET lease_until = ? WHERE seq = ? AND lease_token = ?")
          .bind(new Date(Date.now() + ALERT_LEASE_MS).toISOString(), row.seq, token).run();
        if (!renewed.meta.changes) break;
        const target = await decryptSecret(env.ENC_KEY, ch.target_encrypted);
        const result = target ? await deliver(env, ch.kind, target, formatAlert(ch.kind, { state, name: payload.name, message: payload.message, timestamp: payload.timestamp, link }), `VerifyRuns: ${state} — ${payload.name}`) : { ok: false as const, error: "decrypt" };
        const item: Sent = result.ok ? { id: ch.id, kind: ch.kind, ok: true } : { id: ch.id, kind: ch.kind, ok: false, error: result.error };
        const index = sent.findIndex(s => s.id === ch.id);
        if (index < 0) sent.push(item); else sent[index] = item;
        const evidence = sent.map(({ id: _id, ...s }) => s);
        const stmts = [
          env.DB.prepare("UPDATE alert_outbox SET results = ? WHERE seq = ? AND lease_token = ?").bind(JSON.stringify(sent), row.seq, token),
          env.DB.prepare("UPDATE check_runs SET alerts_sent = ? WHERE id = ? AND EXISTS (SELECT 1 FROM alert_outbox WHERE seq = ? AND lease_token = ?)").bind(JSON.stringify(evidence), row.run_id, row.seq, token),
        ];
        if (!result.ok) stmts.push(env.DB.prepare(`INSERT INTO meta(key, value)
          SELECT 'alert_delivery_failures', '1' WHERE EXISTS (SELECT 1 FROM alert_outbox WHERE seq = ? AND lease_token = ?)
          ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`).bind(row.seq, token));
        const saved = await env.DB.batch(stmts);
        if (!saved[0].meta.changes) break;
      }
      if (sent.some(s => s.ok) || !active.length) {
        const done = await env.DB.prepare("DELETE FROM alert_outbox WHERE seq = ? AND lease_token = ?").bind(row.seq, token).run();
        completed += done.meta.changes || 0;
      } else {
        const delay = Math.min(15 * 60_000, ALERT_RETRY_MS * 2 ** Math.min(row.attempts, 4));
        await env.DB.prepare("UPDATE alert_outbox SET next_attempt_at = ?, lease_token = NULL, lease_until = NULL WHERE seq = ? AND lease_token = ?")
          .bind(new Date(Date.now() + delay).toISOString(), row.seq, token).run();
      }
    } catch (e) {
      // Do not undo a transition or delete the job. A crashed/failed acknowledgement
      // leaves a durable event that the scheduler can reclaim after its lease expires.
      console.error("alert outbox attempt interrupted", row.run_id, e);
    }
  }
  return completed;
}

export type AlertState = "FAIL" | "Recovered";
export interface AlertEvent { state: AlertState; name: string; message: string; timestamp: string; link: string }

/** One message per channel dialect: Slack mrkdwn, Discord markdown, plain text for email. */
/** Slack reads `<…>` as links/mentions and `&` as an entity; user-supplied text must be escaped. */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function formatAlert(kind: string, ev: AlertEvent): string {
  if (kind === "slack") {
    const icon = ev.state === "FAIL" ? ":rotating_light:" : ":white_check_mark:";
    return [`${icon} *${ev.state}* — ${slackEscape(ev.name)}`, slackEscape(ev.message), `_At ${ev.timestamp}_`, ev.link ? `<${ev.link}|Open in VerifyRuns>` : ""].filter(Boolean).join("\n");
  }
  if (kind === "discord") {
    const icon = ev.state === "FAIL" ? "🚨" : "✅";
    return [`${icon} **${ev.state}** — ${ev.name}`, ev.message, `At ${ev.timestamp}`, ev.link].filter(Boolean).join("\n");
  }
  const when = ev.timestamp.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC");
  return [`${ev.state} — ${ev.name}`, "", ev.message, "", `At ${when}`, ev.link ? `Open in VerifyRuns: ${ev.link}` : ""].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trimEnd();
}
