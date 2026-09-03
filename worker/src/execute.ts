/** One check run: read the destination, fingerprint, verdict, persist, route alerts. */
import { maybeAlert } from "./alerts";
import { getCheck, updateCheck } from "./checks";
import { fetchRecords } from "./connectors";
import { annotateCount, computeVerdict, FetchMeta, fingerprint, Fingerprint, splitSample } from "./engine";
import { Env, nowIso, num } from "./env";
import { nextHeartbeatDue } from "./schedule";

export interface RunResult {
  id: string;
  verdict: "PASS" | "FAIL";
  diff_message: string;
  timestamp: string;
}

export async function executeCheck(env: Env, checkId: string, trigger: string, runId: string, isRetry = false, claimedNew: number | null = null, bodyNote: string | null = null): Promise<RunResult | null> {
  const c = await getCheck(env, checkId);
  if (!c) return null;
  let verdict: "PASS" | "FAIL" = "FAIL";
  let message = "";
  let fp: Fingerprint = { record_count: 0, sample_size: 0, fields: [], newest_record: null, newest_window: [], newest_defined: true, null_pct: {} };
  let errorDetails: string | null = null;
  let meta: FetchMeta = { total: 0, capped: false, count_estimated: false };
  try {
    const res = await fetchRecords(env, c.connector_kind, c.config);
    if (res.records === null) {
      message = res.error || "Destination fetch failed.";
      errorDetails = res.details;
    } else {
      meta = res.meta || { total: res.records.length, capped: false, count_estimated: false };
      fp = fingerprint(res.records, meta.total, meta.newest_defined ?? true);
      if (meta.capped) fp.count_capped = true;
      if (meta.count_estimated) fp.count_estimated = true;
      // The run columns cover baselines written before the fingerprint carried the flags.
      const prevRows = (await env.DB.prepare("SELECT fingerprint, count_capped, count_estimated FROM check_runs WHERE check_id = ? AND verdict = 'PASS' ORDER BY timestamp DESC LIMIT 30").bind(checkId).all<{ fingerprint: string; count_capped: number; count_estimated: number }>()).results;
      const prev = prevRows
        .map((r) => {
          const f = JSON.parse(r.fingerprint);
          if (r.count_capped) f.count_capped = true;
          if (r.count_estimated) f.count_estimated = true;
          return { fingerprint: f };
        })
        .reverse();
      [verdict, message] = computeVerdict(fp, prev, c.expectations, claimedNew);
      message = annotateCount(message, meta, num(env.VR_AIRTABLE_MAX_PAGES, 40) * 100);
    }
  } catch (e: any) {
    verdict = "FAIL";
    message = `Unexpected error while checking destination: ${e?.name || "Error"}.`;
    errorDetails = String(e?.message || e).slice(0, 500);
    console.error("executeCheck error", e);
  }

  const [storedFp, sample] = await splitSample(fp, errorDetails, c.store_samples, num(env.VR_SAMPLE_TTL_DAYS, 30));
  const timestamp = nowIso();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint, error_details, is_retry, count_capped, count_estimated, claimed_new, body_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    ).bind(runId, checkId, timestamp, trigger, verdict, message, JSON.stringify(storedFp), isRetry ? 1 : 0, meta.capped ? 1 : 0, meta.count_estimated ? 1 : 0, claimedNew, bodyNote),
  ];
  if (sample) {
    stmts.push(
      env.DB.prepare("INSERT INTO run_samples (run_id, check_id, newest_record, newest_window, error_details, expires_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
        runId, checkId, sample.newest_record ? JSON.stringify(sample.newest_record) : null, JSON.stringify(sample.newest_window), sample.error_details, sample.expires_at,
      ),
    );
  }
  // Every real run re-anchors the heartbeat: due one window from now, in the same batch as the run.
  if (c.heartbeat_hours) {
    stmts.push(
      env.DB.prepare("UPDATE checks SET next_heartbeat_due_at = ? WHERE id = ?").bind(nextHeartbeatDue(new Date(timestamp), c.heartbeat_hours, c.heartbeat_window).toISOString(), checkId),
    );
  }
  await env.DB.batch(stmts);
  const run: RunResult = { id: runId, verdict, diff_message: message, timestamp };

  try {
    const snoozed = !!(c.snooze_until && c.snooze_until > nowIso());
    const freshFail = verdict === "FAIL" && c.last_alerted_verdict !== "FAIL";
    if (!isRetry && freshFail && c.retry_before_alert && !snoozed) {
      const due = new Date(Date.now() + num(env.VR_RETRY_DELAY_SECONDS, 30) * 1000).toISOString();
      await updateCheck(env, checkId, { pending_retry: { due_at: due, claimed_new: claimedNew } });
    } else {
      await maybeAlert(env, c, run, snoozed);
    }
  } catch (e) {
    console.error("post-run alert routing failed", e);
  }
  return run;
}
