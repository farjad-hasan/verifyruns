/** Alert channels and transition-based delivery. Ported from backend/server.py. */
import { CheckDoc } from "./checks";
import { decryptSecret } from "./crypto";
import { emailAvailable, Env, num } from "./env";
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

/** Alert on state transitions using last_alerted_verdict tracked on the Check. */
export async function maybeAlert(env: Env, c: CheckDoc, run: { id: string; verdict: string; diff_message: string; timestamp: string }, snoozed: boolean): Promise<void> {
  const chans = await channels(env, c);
  if (!chans.length) return;
  if (snoozed) return;
  // Claim the transition before delivering: a predicated UPDATE changes exactly one caller's row.
  let next: "FAIL" | "PASS";
  let claim: D1Result;
  if (run.verdict === "FAIL") {
    next = "FAIL";
    claim = await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'FAIL' WHERE id = ? AND (last_alerted_verdict IS NULL OR last_alerted_verdict != 'FAIL')").bind(c.id).run();
  } else if (run.verdict === "PASS") {
    next = "PASS";
    claim = await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'PASS' WHERE id = ? AND last_alerted_verdict = 'FAIL'").bind(c.id).run();
  } else return;
  if (!claim.meta.changes) return; // not a transition, or another caller claimed it
  // What the rollback restores when no channel delivers. Derived from the claim, never from the
  // in-memory doc — the doc was loaded before the destination fetch and can be stale, and restoring
  // a stale 'FAIL' would re-assert this caller's own claim and mute the streak. A PASS claim's
  // predicate guarantees the prior was 'FAIL'; a FAIL claim restores NULL, which is behaviourally
  // identical to 'PASS' for every predicate that reads this column.
  const prior = next === "PASS" ? "FAIL" : null;
  const appUrl = (env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const link = appUrl ? `${appUrl}/checks/${c.id}` : "";
  const state: AlertState = next === "FAIL" ? "FAIL" : "Recovered";
  const subject = `VerifyRuns: ${state} — ${c.name}`;
  const sent: { kind: string; ok: boolean; error?: string }[] = [];
  for (const ch of chans) {
    if (ch.target === null) {
      console.error(`alert channel ${ch.kind} (${ch.id}) on check ${c.id} failed to decrypt`);
      sent.push({ kind: ch.kind, ok: false, error: "decrypt" });
      continue;
    }
    const body = formatAlert(ch.kind, { state, name: c.name, message: run.diff_message, timestamp: run.timestamp, link });
    const r = await deliver(env, ch.kind, ch.target, body, subject);
    sent.push(r.ok ? { kind: ch.kind, ok: true } : { kind: ch.kind, ok: false, error: r.error });
  }
  const failures = sent.filter((s) => !s.ok).length;
  const stmts = [env.DB.prepare("UPDATE check_runs SET alerts_sent = ? WHERE id = ?").bind(JSON.stringify(sent), run.id)];
  if (failures) {
    stmts.push(
      env.DB.prepare("INSERT INTO meta(key, value) VALUES ('alert_delivery_failures', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + CAST(excluded.value AS INTEGER) AS TEXT)").bind(String(failures)),
    );
  }
  if (failures === sent.length) {
    // No channel heard about the streak: release the claim so the next run alerts again. Predicated on
    // the claimed value — if another caller moved the state meanwhile, their state stands.
    stmts.push(env.DB.prepare("UPDATE checks SET last_alerted_verdict = ? WHERE id = ? AND last_alerted_verdict = ?").bind(prior, c.id, next));
  }
  // If this batch throws (DB outage), the claim stands with nothing delivered and the streak stays
  // muted until the next transition; execute.ts catches and logs. Accepted: rarer than channel failure.
  await env.DB.batch(stmts);
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
