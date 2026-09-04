/** Everything time-based, in one idempotent sweep: missed heartbeats, queued runs, due retries, sample expiry.
 *  Driven by the Worker's cron trigger, by traffic (lazy), or by POST /api/internal/tick. */
import { CheckDoc, rowToCheck, updateCheck } from "./checks";
import { maybeAlert } from "./alerts";
import { uuid } from "./crypto";
import { Env, nowIso, num } from "./env";
import { executeCheck } from "./execute";
import { expireResetTokens } from "./reset";
import { describeWindow, HeartbeatWindow, nextHeartbeatDue } from "./schedule";
import { canonicalHash } from "./engine";
import { getCheck } from "./checks";

export function heartbeatDue(heartbeatHours: number | null, anchorTs: string, lastHeartbeatTs: string | null, now: Date): boolean {
  if (!heartbeatHours) return false;
  const windowMs = heartbeatHours * 3600_000;
  if (now.getTime() - new Date(anchorTs).getTime() <= windowMs) return false;
  if (lastHeartbeatTs && now.getTime() - new Date(lastHeartbeatTs).getTime() <= windowMs) return false;
  return true;
}

export function heartbeatMessage(elapsedHours: number, heartbeatHours: number, window: HeartbeatWindow | null = null): string {
  const suffix = window ? ` (${describeWindow(window)})` : "";
  return `No run in ${Math.round(elapsedHours)} h — expected one every ${heartbeatHours} h${suffix}.`;
}

export const DEFAULT_TICK_BATCH = 25;
const batchOf = (env: Env) => Math.max(1, num(env.VR_TICK_BATCH, DEFAULT_TICK_BATCH));

export async function heartbeatTick(env: Env, now: Date): Promise<number> {
  let fired = 0;
  // One range scan over the maintained due column (partial index); idle Checks cost nothing.
  const rows = (await env.DB.prepare("SELECT * FROM checks WHERE next_heartbeat_due_at IS NOT NULL AND next_heartbeat_due_at <= ? LIMIT ?").bind(now.toISOString(), batchOf(env)).all()).results;
  for (const row of rows) {
    const c = rowToCheck(row);
    const due = (row as any).next_heartbeat_due_at as string;
    if (!c.heartbeat_hours) {
      // stale column (cadence cleared under a race): heal it instead of firing
      await env.DB.prepare("UPDATE checks SET next_heartbeat_due_at = NULL WHERE id = ? AND next_heartbeat_due_at = ?").bind(c.id, due).run();
      continue;
    }
    // The anchor is only needed for the message wording — one query per DUE Check, none for idle ones.
    const lastReal = await env.DB.prepare("SELECT timestamp FROM check_runs WHERE check_id = ? AND trigger != 'heartbeat' ORDER BY timestamp DESC LIMIT 1").bind(c.id).first<{ timestamp: string }>();
    const anchor = lastReal?.timestamp || c.created_at || nowIso();
    const elapsedH = (now.getTime() - new Date(anchor).getTime()) / 3600_000;
    const runId = uuid();
    const timestamp = nowIso();
    const message = heartbeatMessage(elapsedH, c.heartbeat_hours, c.heartbeat_window);
    const fp = { record_count: 0, sample_size: 0, fields: [], newest_hash: null, sample_stored: false, newest_defined: true, null_pct: {} };
    // One statement: insert only if no heartbeat already landed inside this window, so concurrent ticks cannot both fire.
    const windowStart = new Date(now.getTime() - c.heartbeat_hours * 3600_000).toISOString();
    const res = await env.DB.prepare(
      `INSERT INTO check_runs (id, check_id, timestamp, heartbeat_at, trigger, verdict, diff_message, fingerprint, error_details, is_retry, count_capped, count_estimated, claimed_new, body_note)
       SELECT ?, ?, ?, ?, 'heartbeat', 'FAIL', ?, ?, NULL, 0, 0, 0, NULL, NULL
       WHERE NOT EXISTS (SELECT 1 FROM check_runs WHERE check_id = ? AND trigger = 'heartbeat' AND COALESCE(heartbeat_at, timestamp) >= ?)`,
    ).bind(runId, c.id, timestamp, now.toISOString(), message, JSON.stringify(fp), c.id, windowStart).run();
    // Advance the due time whether or not this caller won the insert (the loser must not re-select the
    // Check every tick), predicated on the value we read so a fresher run-insert update is not clobbered.
    const nextDue = nextHeartbeatDue(now, c.heartbeat_hours, c.heartbeat_window).toISOString();
    await env.DB.prepare("UPDATE checks SET next_heartbeat_due_at = ? WHERE id = ? AND next_heartbeat_due_at = ?").bind(nextDue, c.id, due).run();
    if (!res.meta.changes) continue; // another tick fired this window first
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
  // The due filter keeps not-yet-due retries from occupying LIMIT slots and starving due ones.
  const rows = (
    await env.DB.prepare("SELECT id, pending_retry FROM checks WHERE pending_retry IS NOT NULL AND json_extract(pending_retry, '$.due_at') <= ? LIMIT ?").bind(now.toISOString(), batchOf(env)).all<{ id: string; pending_retry: string }>()
  ).results;
  for (const row of rows) {
    const pr = JSON.parse(row.pending_retry);
    if (!pr?.due_at || new Date(pr.due_at).getTime() > now.getTime()) continue;
    // clear first, conditionally, so two ticks cannot both run it
    const res = await env.DB.prepare("UPDATE checks SET pending_retry = NULL WHERE id = ? AND pending_retry = ?").bind(row.id, row.pending_retry).run();
    if (!res.meta.changes) continue;
    try {
      const check = await getCheck(env, row.id);
      if (!check) continue;
      if (pr.source_key && pr.source_key !== await canonicalHash({ kind: check.connector_kind, config: check.config })) continue;
      await executeCheck(env, row.id, "retry", uuid(), true, pr.claimed_new ?? null, null, null, pr.count_baseline);
      ran += 1;
    } catch (e) {
      console.error("retry failed for check", row.id, e);
    }
  }
  return ran;
}

/** Append one queued run in a single UPDATE — no read, so concurrent webhooks cannot overwrite each other. */
export async function enqueueRun(env: Env, checkId: string, item: CheckDoc["pending_runs"][number]): Promise<void> {
  await env.DB.prepare("UPDATE checks SET pending_runs = json_insert(pending_runs, '$[#]', json(?)) WHERE id = ?").bind(JSON.stringify(item), checkId).run();
}

/** Remove exactly one queued item by run_id — concurrency-safe against `json_insert` appends,
 *  since the index is re-derived inside the statement at removal time. */
async function removeQueued(env: Env, checkId: string, runId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE checks SET pending_runs = json_remove(pending_runs,
       (SELECT fullkey FROM json_each(checks.pending_runs) WHERE json_extract(value, '$.run_id') = ? LIMIT 1))
     WHERE id = ? AND EXISTS (SELECT 1 FROM json_each(checks.pending_runs) WHERE json_extract(value, '$.run_id') = ?)`,
  ).bind(runId, checkId, runId).run();
}

/** At-least-once drain: an item leaves the queue only after its run is recorded. A tick that dies
 *  mid-drain — thrown error or hard eviction — resumes where it stopped on the next tick. An item
 *  whose run is already recorded (eviction landed between execute and remove) is reconciled without
 *  a second destination fetch, since run ids are primary keys. */
export async function drainPendingRuns(env: Env, batch?: number, exec: typeof executeCheck = executeCheck): Promise<number> {
  const limit = batch ?? batchOf(env);
  let ran = 0;
  // The item budget is shared across the whole sweep, not per Check — each execution is a
  // destination fetch, and the Workers subrequest budget is per invocation.
  let budget = limit;
  const rows = (await env.DB.prepare("SELECT id, pending_runs FROM checks WHERE pending_runs != '[]' LIMIT ?").bind(limit).all<{ id: string; pending_runs: string }>()).results;
  for (const row of rows) {
    if (budget <= 0) break;
    const items = JSON.parse(row.pending_runs) as CheckDoc["pending_runs"];
    for (const item of items.slice(0, budget)) {
      budget -= 1;
      const recorded = await env.DB.prepare("SELECT 1 AS x FROM check_runs WHERE id = ?").bind(item.run_id).first();
      if (!recorded) {
        try {
          const reported = item.reported_failure ? { failed: true, error: item.reported_error ?? null } : null;
          await exec(env, row.id, "webhook", item.run_id, false, item.claimed_new ?? null, item.body_note ?? null, reported);
          ran += 1;
        } catch (e) {
          // Leave this item and its successors queued: order is preserved and the next tick resumes
          // here. A stuck item is visible (queue depth), a dropped one would not be.
          console.error("queued run failed; leaving it queued", item.run_id, e);
          break;
        }
      }
      await removeQueued(env, row.id, item.run_id);
    }
  }
  return ran;
}

/** Bounded run history: delete rows older than VR_RUN_RETENTION_DAYS that sit beyond BOTH the
 *  newest VR_RUN_RETENTION_MIN rows and the newest 30 PASS rows of their Check. The explicit PASS
 *  floor matters because the newest rows can be FAILs (a heartbeat streak), which would otherwise
 *  push a quiet Check's verdict baseline past the row floor into deletion. A rotating cursor in
 *  meta.retention_cursor spreads the work: VR_TICK_BATCH Checks per tick, full rotation every few
 *  ticks — ample against a 90-day horizon. */
const RETENTION_SWEEP_EVERY_MS = 10 * 60_000;
export const RETENTION_ROW_BUDGET = 200; // per sweep pass: deletions are D1 writes and count against the daily quota

/** Claim one retention pass per RETENTION_SWEEP_EVERY_MS (predicated update, like the lazy tick):
 *  a big backfill then costs at most ~29k row-writes/day instead of the whole daily quota at once. */
async function retentionDue(env: Env, now: Date): Promise<boolean> {
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('retention_last_at', '1970-01-01T00:00:00.000Z') ON CONFLICT(key) DO NOTHING").run();
  const cutoff = new Date(now.getTime() - RETENTION_SWEEP_EVERY_MS).toISOString();
  const res = await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'retention_last_at' AND value < ?").bind(now.toISOString(), cutoff).run();
  return !!res.meta.changes;
}

export async function retentionSweep(env: Env, now: Date, rowBudget = RETENTION_ROW_BUDGET): Promise<number> {
  const days = num(env.VR_RUN_RETENTION_DAYS, 90);
  if (days <= 0) return 0; // 0 disables retention entirely
  // Clamped to 30: the invariant "retention never removes a run the timeline reads" is a property
  // of this floor, not of the env value.
  const floor = Math.max(30, num(env.VR_RUN_RETENTION_MIN, 35));
  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString();
  const batch = batchOf(env);
  const cursor = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'retention_cursor'").first<{ value: string }>())?.value ?? "";
  const checks = (await env.DB.prepare("SELECT id FROM checks WHERE id > ? ORDER BY id LIMIT ?").bind(cursor, batch).all<{ id: string }>()).results;
  let deleted = 0;
  let budget = rowBudget;
  for (const c of checks) {
    if (budget <= 0) break; // the cursor still advances; the remainder drains on later rotations
    // The inner LIMIT bounds rows per statement: a first visit to a 100k-run Check must not spend
    // the day's write quota (or the statement time limit) in one DELETE.
    const res = await env.DB.prepare(
      `DELETE FROM check_runs WHERE id IN (
         SELECT id FROM check_runs WHERE check_id = ?1 AND timestamp < ?2
           AND id NOT IN (SELECT id FROM check_runs WHERE check_id = ?1 ORDER BY timestamp DESC LIMIT ?3)
           AND id NOT IN (SELECT id FROM check_runs WHERE check_id = ?1 AND verdict = 'PASS' ORDER BY timestamp DESC LIMIT 30)
         ORDER BY timestamp ASC LIMIT ?4
       )`,
    ).bind(c.id, cutoff, floor, budget).run();
    const n = res.meta.changes || 0;
    deleted += n;
    budget -= n;
  }
  // An empty cursor restarts the rotation; a short page means the rotation just finished.
  const next = checks.length < batch ? "" : checks[checks.length - 1].id;
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('retention_cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(next).run();
  return deleted;
}

/** Expired samples and spent/expired password-reset tokens leave in the same sweep. */
export async function expireSamples(env: Env, now: Date): Promise<number> {
  const res = await env.DB.prepare("DELETE FROM run_samples WHERE expires_at < ?").bind(now.toISOString()).run();
  await expireResetTokens(env, now);
  return res.meta.changes || 0;
}

async function stampTick(env: Env, now: Date): Promise<void> {
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('tick_last_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now.toISOString()).run();
}

/** True for exactly one caller per VR_LAZY_TICK_SECONDS window (conditional update on the stamp).
 *  The cron covers the minute cadence in production; the lazy tick is the self-hosters' fallback. */
export async function claimLazyTick(env: Env, now: Date = new Date()): Promise<boolean> {
  const windowS = num(env.VR_LAZY_TICK_SECONDS, 300);
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
  expired_runs: number;
}

export async function tick(env: Env, now: Date = new Date()): Promise<TickResult> {
  await stampTick(env, now);
  const heartbeats = await heartbeatTick(env, now);
  const queued = await drainPendingRuns(env);
  const retries = await drainRetries(env, now);
  const expired_samples = await expireSamples(env, now);
  const expired_runs = (await retentionDue(env, now)) ? await retentionSweep(env, now) : 0;
  // Completion stamp, distinct from the start stamp above: a tick that starts and then throws every
  // invocation is observable as a stale tick_last_ok_at while tick_last_at stays fresh.
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('tick_last_ok_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(now.toISOString()).run();
  return { heartbeats, queued, retries, expired_samples, expired_runs };
}

export async function tickSafely(env: Env): Promise<void> {
  try {
    const res = await tick(env);
    if (res.heartbeats || res.queued || res.retries || res.expired_samples || res.expired_runs) console.log("tick", JSON.stringify(res));
  } catch (e) {
    console.error("tick failed", e);
  }
}

export { updateCheck };
