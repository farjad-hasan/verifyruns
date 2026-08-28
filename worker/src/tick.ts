/** Everything time-based, in one idempotent sweep: missed heartbeats, queued runs, due retries, sample expiry.
 *  Driven by the Worker's cron trigger, by traffic (lazy), or by POST /api/internal/tick. */
import { rowToCheck, updateCheck } from "./checks";
import { maybeAlert } from "./alerts";
import { uuid } from "./crypto";
import { Env, nowIso, num } from "./env";
import { executeCheck } from "./execute";

export function heartbeatDue(heartbeatHours: number | null, anchorTs: string, lastHeartbeatTs: string | null, now: Date): boolean {
  if (!heartbeatHours) return false;
  const windowMs = heartbeatHours * 3600_000;
  if (now.getTime() - new Date(anchorTs).getTime() <= windowMs) return false;
  if (lastHeartbeatTs && now.getTime() - new Date(lastHeartbeatTs).getTime() <= windowMs) return false;
  return true;
}

export function heartbeatMessage(elapsedHours: number, heartbeatHours: number): string {
  return `No run in ${Math.round(elapsedHours)} h — expected one every ${heartbeatHours} h.`;
}

export async function heartbeatTick(env: Env, now: Date): Promise<number> {
  let fired = 0;
  const rows = (await env.DB.prepare("SELECT * FROM checks WHERE heartbeat_hours IS NOT NULL AND heartbeat_hours > 0").all()).results;
  for (const row of rows) {
    const c = rowToCheck(row);
    const lastReal = await env.DB.prepare("SELECT timestamp FROM check_runs WHERE check_id = ? AND trigger != 'heartbeat' ORDER BY timestamp DESC LIMIT 1").bind(c.id).first<{ timestamp: string }>();
    const anchor = lastReal?.timestamp || c.created_at || nowIso();
    const lastHb = await env.DB.prepare("SELECT heartbeat_at, timestamp FROM check_runs WHERE check_id = ? AND trigger = 'heartbeat' ORDER BY heartbeat_at DESC LIMIT 1").bind(c.id).first<{ heartbeat_at: string | null; timestamp: string }>();
    const lastHbTs = lastHb?.heartbeat_at || lastHb?.timestamp || null;
    if (!heartbeatDue(c.heartbeat_hours, anchor, lastHbTs, now)) continue;
    const elapsedH = (now.getTime() - new Date(anchor).getTime()) / 3600_000;
    const runId = uuid();
    const timestamp = nowIso();
    const message = heartbeatMessage(elapsedH, c.heartbeat_hours!);
    const fp = { record_count: 0, sample_size: 0, fields: [], newest_hash: null, sample_stored: false, newest_defined: true, null_pct: {} };
    await env.DB.prepare(
      `INSERT INTO check_runs (id, check_id, timestamp, heartbeat_at, trigger, verdict, diff_message, fingerprint, error_details, is_retry, count_capped, count_estimated, claimed_new, body_note)
       VALUES (?, ?, ?, ?, 'heartbeat', 'FAIL', ?, ?, NULL, 0, 0, 0, NULL, NULL)`,
    ).bind(runId, c.id, timestamp, now.toISOString(), message, JSON.stringify(fp)).run();
    fired += 1;
    try {
      const snoozed = !!(c.snooze_until && c.snooze_until > nowIso());
      await maybeAlert(env, c, { id: runId, verdict: "FAIL", diff_message: message, timestamp }, snoozed);
    } catch (e) {
      console.error("heartbeat alert routing failed", e);
    }
  }
  return fired;
}

export async function drainRetries(env: Env, now: Date): Promise<number> {
  let ran = 0;
  const rows = (await env.DB.prepare("SELECT id, pending_retry FROM checks WHERE pending_retry IS NOT NULL").all<{ id: string; pending_retry: string }>()).results;
  for (const row of rows) {
    const pr = JSON.parse(row.pending_retry);
    if (!pr?.due_at || new Date(pr.due_at).getTime() > now.getTime()) continue;
    // clear first, conditionally, so two ticks cannot both run it
    const res = await env.DB.prepare("UPDATE checks SET pending_retry = NULL WHERE id = ? AND pending_retry = ?").bind(row.id, row.pending_retry).run();
    if (!res.meta.changes) continue;
    try {
      await executeCheck(env, row.id, "retry", uuid(), true, pr.claimed_new ?? null);
      ran += 1;
    } catch (e) {
      console.error("retry failed for check", row.id, e);
    }
  }
  return ran;
}

export async function drainPendingRuns(env: Env): Promise<number> {
  let ran = 0;
  const rows = (await env.DB.prepare("SELECT id, pending_runs FROM checks WHERE pending_runs != '[]'").all<{ id: string; pending_runs: string }>()).results;
  for (const row of rows) {
    const res = await env.DB.prepare("UPDATE checks SET pending_runs = '[]' WHERE id = ? AND pending_runs = ?").bind(row.id, row.pending_runs).run();
    if (!res.meta.changes) continue; // another tick swapped it first
    for (const item of JSON.parse(row.pending_runs) as { run_id: string; claimed_new: number | null; body_note: string | null }[]) {
      try {
        await executeCheck(env, row.id, "webhook", item.run_id, false, item.claimed_new ?? null, item.body_note ?? null);
        ran += 1;
      } catch (e) {
        console.error("queued run failed", item.run_id, e);
      }
    }
  }
  return ran;
}

export async function expireSamples(env: Env, now: Date): Promise<number> {
  const res = await env.DB.prepare("DELETE FROM run_samples WHERE expires_at < ?").bind(now.toISOString()).run();
  return res.meta.changes || 0;
}

async function stampTick(env: Env, now: Date): Promise<void> {
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('tick_last_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now.toISOString()).run();
}

/** True for exactly one caller per VR_LAZY_TICK_SECONDS window (conditional update on the stamp). */
export async function claimLazyTick(env: Env, now: Date = new Date()): Promise<boolean> {
  const windowS = num(env.VR_LAZY_TICK_SECONDS, 60);
  if (windowS <= 0) return false;
  const cutoff = new Date(now.getTime() - windowS * 1000).toISOString();
  const res = await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at' AND value < ?").bind(now.toISOString(), cutoff).run();
  return !!res.meta.changes;
}

export interface TickResult {
  heartbeats: number;
  queued: number;
  retries: number;
  expired_samples: number;
}

export async function tick(env: Env, now: Date = new Date()): Promise<TickResult> {
  await stampTick(env, now);
  const heartbeats = await heartbeatTick(env, now);
  const queued = await drainPendingRuns(env);
  const retries = await drainRetries(env, now);
  const expired_samples = await expireSamples(env, now);
  return { heartbeats, queued, retries, expired_samples };
}

export async function tickSafely(env: Env): Promise<void> {
  try {
    const res = await tick(env);
    if (res.heartbeats || res.queued || res.retries || res.expired_samples) console.log("tick", JSON.stringify(res));
  } catch (e) {
    console.error("tick failed", e);
  }
}

export { updateCheck };
