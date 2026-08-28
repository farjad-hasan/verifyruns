/** Alert channels and transition-based delivery. Ported from backend/server.py. */
import { CheckDoc, updateCheck } from "./checks";
import { decryptSecret } from "./crypto";
import { emailAvailable, Env } from "./env";
import { httpFetch } from "./net";

const DISCORD_MAX_CHARS = 2000;

export interface LiveChannel {
  id: string;
  kind: "slack" | "discord" | "email";
  target: string;
}

export async function channels(env: Env, c: CheckDoc): Promise<LiveChannel[]> {
  const out: LiveChannel[] = [];
  if (c.alert_slack_webhook_encrypted) {
    const target = await decryptSecret(env.ENC_KEY, c.alert_slack_webhook_encrypted);
    if (target) out.push({ id: "legacy-slack", kind: "slack", target });
  }
  for (const ch of c.alert_channels) {
    const target = await decryptSecret(env.ENC_KEY, ch.target_encrypted);
    if (target) out.push({ id: ch.id, kind: ch.kind, target });
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
      signal: AbortSignal.timeout(8000),
    });
    if (kind === "slack") resp = await httpFetch(target, init({ text }));
    else if (kind === "discord") resp = await httpFetch(target, init({ content: text.slice(0, DISCORD_MAX_CHARS) }));
    else if (kind === "email") {
      if (!emailAvailable(env)) return { ok: false, error: "email alerts need RESEND_API_KEY and ALERT_FROM on the server" };
      resp = await httpFetch("https://api.resend.com/emails", init({ from: env.ALERT_FROM, to: [target], subject, text }, { authorization: `Bearer ${env.RESEND_API_KEY}` }));
    } else return { ok: false, error: `unknown channel kind ${kind}` };
    if (resp.status >= 400) {
      const body = (await resp.text().catch(() => "")).slice(0, 300);
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
  const fresh = await env.DB.prepare("SELECT last_alerted_verdict FROM checks WHERE id = ?").bind(c.id).first<{ last_alerted_verdict: string | null }>();
  const last = fresh?.last_alerted_verdict ?? null;
  let header = "";
  let next = last;
  if (run.verdict === "FAIL" && last !== "FAIL") {
    header = `:rotating_light: *FAIL* — ${c.name}`;
    next = "FAIL";
  } else if (run.verdict === "PASS" && last === "FAIL") {
    header = `:white_check_mark: *Recovered* — ${c.name}`;
    next = "PASS";
  } else return;
  const appUrl = (env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const link = appUrl ? `${appUrl}/checks/${c.id}` : "";
  const text = `${header}\n${run.diff_message}\n_At ${run.timestamp}_`;
  const subject = `VerifyRuns: ${header.replace(/\*/g, "").split(" ").slice(1).join(" ")}`;
  const sent: { kind: string; ok: boolean; error?: string }[] = [];
  for (const ch of chans) {
    let body = text;
    if (link) body += ch.kind === "slack" ? `\n<${link}|Open in VerifyRuns>` : `\n${link}`;
    const r = await deliver(env, ch.kind, ch.target, body, subject);
    sent.push(r.ok ? { kind: ch.kind, ok: true } : { kind: ch.kind, ok: false, error: r.error });
  }
  await updateCheck(env, c.id, { last_alerted_verdict: next });
  await env.DB.prepare("UPDATE check_runs SET alerts_sent = ? WHERE id = ?").bind(JSON.stringify(sent), run.id).run();
}
