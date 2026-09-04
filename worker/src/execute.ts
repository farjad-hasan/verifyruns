/** One check run: read the destination, fingerprint, verdict, persist, route alerts. */
import { maybeAlert } from "./alerts";
import { getCheck, updateCheck } from "./checks";
import { fetchRecords } from "./connectors";
import { annotateCount, canonicalHash, computeVerdict, CountBaseline, FetchMeta, fingerprint, Fingerprint, Reported, reportedFailureMessage, splitSample } from "./engine";
import { Env, nowIso, num } from "./env";
import { nextHeartbeatDue } from "./schedule";

export interface RunResult {
  id: string;
  verdict: "PASS" | "FAIL";
  diff_message: string;
  timestamp: string;
}

export async function executeCheck(env: Env, checkId: string, trigger: string, runId: string, isRetry = false, claimedNew: number | null = null, bodyNote: string | null = null, reported: Reported | null = null, retryBaseline?: CountBaseline | null): Promise<RunResult | null> {
  const startedAt = nowIso();
  const c = await getCheck(env, checkId);
  if (!c) return null;
  // Bind observations to the actual destination configuration. A changed URL/query/credential
  // starts fresh instead of comparing counts from two different data sets.
  const sourceKey = (await canonicalHash({ kind: c.connector_kind, config: c.config }))!;
  const prior = await env.DB.prepare("SELECT fingerprint FROM check_runs WHERE check_id = ? AND json_extract(fingerprint, '$.read_succeeded') = 1 AND json_extract(fingerprint, '$.source_key') = ? ORDER BY timestamp DESC, rowid DESC LIMIT 1").bind(checkId, sourceKey).first<{ fingerprint: string }>();
  const priorFp = prior ? JSON.parse(prior.fingerprint) : null;
  const baseline: CountBaseline | null = retryBaseline !== undefined ? retryBaseline : priorFp ? { record_count: priorFp.record_count, count_capped: !!priorFp.count_capped, count_estimated: !!priorFp.count_estimated } : null;
  let verdict: "PASS" | "FAIL" = "FAIL";
  let message = "";
  let fp: Fingerprint = { record_count: 0, sample_size: 0, fields: [], newest_record: null, newest_window: [], newest_defined: true, null_pct: {} };
  let errorDetails: string | null = null;
  let readFailed = false;
  let meta: FetchMeta = { total: 0, capped: false, count_estimated: false };
  try {
    const res = await fetchRecords(env, c.connector_kind, c.config);
    if (res.records === null) {
      message = res.error || "Destination fetch failed.";
      errorDetails = res.details;
      readFailed = true;
    } else {
      meta = res.meta || { total: res.records.length, capped: false, count_estimated: false };
      fp = fingerprint(res.records, meta.total, meta.newest_defined ?? true);
      if (meta.capped) fp.count_capped = true;
      if (meta.count_estimated) fp.count_estimated = true;
      // The run columns cover baselines written before the fingerprint carried the flags.
      const prevRows = (await env.DB.prepare("SELECT fingerprint, count_capped, count_estimated FROM check_runs WHERE check_id = ? AND verdict = 'PASS' AND json_extract(fingerprint, '$.source_key') = ? ORDER BY timestamp DESC, rowid DESC LIMIT 30").bind(checkId, sourceKey).all<{ fingerprint: string; count_capped: number; count_estimated: number }>()).results;
      const prev = prevRows
        .map((r) => {
          const f = JSON.parse(r.fingerprint);
          if (r.count_capped) f.count_capped = true;
          if (r.count_estimated) f.count_estimated = true;
          return { fingerprint: f };
        })
        .reverse();
      [verdict, message] = computeVerdict(fp, prev, c.expectations, claimedNew, baseline);
      message = annotateCount(message, meta, num(env.VR_AIRTABLE_MAX_PAGES, 40) * 100);
    }
  } catch (e: any) {
    verdict = "FAIL";
    message = `Unexpected error while checking destination: ${e?.name || "Error"}.`;
    errorDetails = String(e?.message || e).slice(0, 500);
    readFailed = true;
    console.error("executeCheck error", e);
  }

  // The workflow's own verdict outranks the destination's: it is recorded as a FAIL whatever the
  // read showed, and a readable fingerprint remains a count observation, but never joins field history.
  const reportedFailure = !!reported?.failed;
  if (reportedFailure) {
    verdict = "FAIL";
    const sentence = reportedFailureMessage(reported?.error ?? null);
    message = readFailed ? `${sentence} Destination could not be read: ${message}` : sentence;
  }
  fp.read_succeeded = !readFailed;
  fp.source_key = sourceKey;
  fp.count_baseline = baseline;
  // A malformed claim must not quietly downgrade an intended count assertion to optional growth.
  if (!reportedFailure && bodyNote && /`(?:wrote|expected_new)`/.test(bodyNote)) {
    verdict = "FAIL";
    message = `Verification incomplete. ${bodyNote}. Send a non-negative integer in wrote.`;
  }
  const superseded = isRetry && !!(await env.DB.prepare("SELECT 1 AS x FROM check_runs WHERE check_id = ? AND is_retry = 0 AND trigger != 'heartbeat' AND timestamp >= ? LIMIT 1").bind(checkId, startedAt).first());
  if (superseded) {
    verdict = "FAIL";
    message = "Verification incomplete. A newer workflow observation superseded this retry; use the newer workflow run to assess its outcome.";
    fp.read_succeeded = false; // stale evidence must not become the next interval's baseline
  }
  const [storedFp, sample] = await splitSample(fp, errorDetails, c.store_samples, num(env.VR_SAMPLE_TTL_DAYS, 30));
  const timestamp = nowIso();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint, error_details, is_retry, count_capped, count_estimated, claimed_new, body_note, reported_failure, reported_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(runId, checkId, timestamp, trigger, verdict, message, JSON.stringify(storedFp), isRetry ? 1 : 0, meta.capped ? 1 : 0, meta.count_estimated ? 1 : 0, claimedNew, bodyNote, reportedFailure ? 1 : 0, reportedFailure ? reported?.error ?? null : null),
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
  // A reported failure also cancels a retry left by an earlier ordinary FAIL: that retry would read a
  // healthy destination, PASS, and send a false Recovered seconds after the failure alert.
  if (!isRetry) stmts.push(env.DB.prepare("UPDATE checks SET pending_retry = NULL WHERE id = ?").bind(checkId));
  await env.DB.batch(stmts);
  const run: RunResult = { id: runId, verdict, diff_message: message, timestamp };

  // Establishing the first baseline is setup, not an incident. Real failures still alert.
  if (superseded || (message.startsWith("Verification incomplete.") && message.includes("Baseline recorded at"))) return run;
  try {
    const snoozed = !!(c.snooze_until && c.snooze_until > nowIso());
    const freshFail = verdict === "FAIL" && c.last_alerted_verdict !== "FAIL";
    // A retry is claimed (pending_retry cleared) before it reads the destination, so a reported
    // failure landing during that read cannot cancel it. If one did, this PASS must not say Recovered.
    if (isRetry && verdict === "PASS") {
      const overtaken = await env.DB.prepare("SELECT 1 AS x FROM check_runs WHERE check_id = ? AND is_retry = 0 AND trigger != 'heartbeat' AND timestamp >= ? AND id != ? LIMIT 1").bind(checkId, startedAt, runId).first();
      if (overtaken) {
        console.warn("retry PASS overtaken by a reported failure; not alerting", checkId, runId);
        return run;
      }
    }
    // A reported failure is never retried: re-reading the destination cannot change what the
    // workflow said, and a passing retry would swallow the alert.
    if (!isRetry && freshFail && c.retry_before_alert && !snoozed && !reportedFailure && baseline && !message.startsWith("Verification incomplete.") && !message.includes("checks could not be evaluated:")) {
      const due = new Date(Date.now() + num(env.VR_RETRY_DELAY_SECONDS, 30) * 1000).toISOString();
      await updateCheck(env, checkId, { pending_retry: { due_at: due, claimed_new: claimedNew, count_baseline: baseline, source_key: sourceKey } });
    } else {
      await maybeAlert(env, c, run, snoozed);
    }
  } catch (e) {
    console.error("post-run alert routing failed", e);
  }
  return run;
}
