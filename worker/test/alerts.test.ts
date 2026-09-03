import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { deliver, formatAlert, maybeAlert, slackEscape } from "../src/alerts";
import { tick } from "../src/tick";
import { getCheck } from "../src/checks";
import { setFetchForTests } from "../src/net";
import { api, jsonResponse, makeCheck, user } from "./helpers";

afterEach(() => setFetchForTests(null));

const SLACK = "https://hooks.slack.com/services/T/B/x";
const DISCORD = "https://discord.com/api/webhooks/1/x";

async function insertRun(checkId: string, id: string, verdict: "PASS" | "FAIL") {
  const timestamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint) VALUES (?, ?, ?, 'webhook', ?, 'm', '{}')").bind(id, checkId, timestamp, verdict).run();
  return { id, verdict, diff_message: "m", timestamp };
}

const alertsSent = async (runId: string): Promise<any[] | null> => {
  const row = await env.DB.prepare("SELECT alerts_sent FROM check_runs WHERE id = ?").bind(runId).first<{ alerts_sent: string | null }>();
  return row?.alerts_sent ? JSON.parse(row.alerts_sent) : null;
};

const failureCounter = async (): Promise<number> => {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'alert_delivery_failures'").first<{ value: string }>();
  return Number(row?.value ?? 0);
};

describe("deliver", () => {
  it("returns the provider's status and body when delivery is refused, so the run can show why", async () => {
    setFetchForTests(async () => new Response(JSON.stringify({ statusCode: 422, name: "validation_error", message: "The from field is invalid" }), { status: 422 }));
    const r = await deliver({ ...env, RESEND_API_KEY: "re_test", ALERT_FROM: "bad-from" } as any, "email", "a@b.co", "text", "subject");
    expect(r.ok).toBe(false);
    expect((r as any).error).toBe('422 {"statusCode":422,"name":"validation_error","message":"The from field is invalid"}');
  });
  it("reports success plainly", async () => {
    setFetchForTests(async () => new Response("{}", { status: 200 }));
    const r = await deliver(env as any, "slack", "https://hooks.slack.com/x", "text");
    expect(r).toEqual({ ok: true });
  });
  it("names a missing email configuration instead of failing silently", async () => {
    const r = await deliver({ ...env, RESEND_API_KEY: "", ALERT_FROM: "" } as any, "email", "a@b.co", "text", "s");
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/RESEND_API_KEY/);
  });
});

describe("delivery durability", () => {
  it("all channels failing rolls the claim back so the next FAIL of the streak alerts again", async () => {
    setFetchForTests(async () => new Response("no", { status: 500 }));
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const before = await failureCounter();
    const run1 = await insertRun(c.id, "af1", "FAIL");
    await maybeAlert(env, (await getCheck(env, c.id))!, run1, false);
    expect(await alertsSent("af1")).toEqual([{ kind: "slack", ok: false, error: "500 no" }]);
    expect(await failureCounter()).toBe(before + 1);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
    setFetchForTests(async () => new Response("ok"));
    const run2 = await insertRun(c.id, "af2", "FAIL");
    const mid = await failureCounter();
    await maybeAlert(env, (await getCheck(env, c.id))!, run2, false);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("FAIL");
    expect(await alertsSent("af2")).toEqual([{ kind: "slack", ok: true }]);
    expect(await failureCounter()).toBe(mid); // healthy delivery does not move the counter
  });

  it("a stale doc cannot make the rollback re-assert this caller's own FAIL claim", async () => {
    setFetchForTests(async () => new Response("no", { status: 500 }));
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    // the doc is loaded while the stored value is still FAIL (an alerted streak)...
    await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'FAIL' WHERE id = ?").bind(c.id).run();
    const staleDoc = (await getCheck(env, c.id))!;
    // ...then a concurrent recovery claims PASS before this run's verdict lands
    await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'PASS' WHERE id = ?").bind(c.id).run();
    const run = await insertRun(c.id, "as1", "FAIL");
    await maybeAlert(env, staleDoc, run, false);
    // the failed delivery must release the claim, not restore the stale 'FAIL'
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
    setFetchForTests(async () => new Response("ok"));
    const run2 = await insertRun(c.id, "as2", "FAIL");
    await maybeAlert(env, (await getCheck(env, c.id))!, run2, false);
    expect(await alertsSent("as2")).toEqual([{ kind: "slack", ok: true }]);
  });

  it("a failed recovery delivery re-alerts on the next PASS even with a stale doc", async () => {
    setFetchForTests(async () => new Response("no", { status: 500 }));
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'FAIL' WHERE id = ?").bind(c.id).run();
    const staleDoc = { ...(await getCheck(env, c.id))!, last_alerted_verdict: null }; // doc predates the FAIL alert
    const run = await insertRun(c.id, "ar1", "PASS");
    await maybeAlert(env, staleDoc, run, false);
    expect(await alertsSent("ar1")).toEqual([{ kind: "slack", ok: false, error: "500 no" }]);
    // the rollback must restore 'FAIL' (guaranteed by the claim predicate), not the stale null
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("FAIL");
    setFetchForTests(async () => new Response("ok"));
    const run2 = await insertRun(c.id, "ar2", "PASS");
    await maybeAlert(env, (await getCheck(env, c.id))!, run2, false);
    expect(await alertsSent("ar2")).toEqual([{ kind: "slack", ok: true }]);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("PASS");
  });

  it("one of two channels failing keeps the claim and records both outcomes", async () => {
    let deliveries = 0;
    setFetchForTests(async (url) => {
      deliveries++;
      return String(url).startsWith(SLACK) ? new Response("ok") : new Response("gone", { status: 404 });
    });
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }, { kind: "discord", target: DISCORD }] });
    const before = await failureCounter();
    const run1 = await insertRun(c.id, "ap1", "FAIL");
    await maybeAlert(env, (await getCheck(env, c.id))!, run1, false);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("FAIL");
    expect(await alertsSent("ap1")).toEqual([
      { kind: "slack", ok: true },
      { kind: "discord", ok: false, error: "404 gone" },
    ]);
    expect(await failureCounter()).toBe(before + 1);
    // the streak is alerted: the next FAIL neither claims nor delivers
    const run2 = await insertRun(c.id, "ap2", "FAIL");
    deliveries = 0;
    await maybeAlert(env, (await getCheck(env, c.id))!, run2, false);
    expect(deliveries).toBe(0);
    expect(await alertsSent("ap2")).toBeNull();
  });

  it("concurrent maybeAlerts with a failing channel attempt delivery once, then roll back", async () => {
    let attempts = 0;
    setFetchForTests(async () => {
      attempts++;
      return new Response("no", { status: 500 });
    });
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const doc = (await getCheck(env, c.id))!;
    const run = await insertRun(c.id, "ac1", "FAIL");
    await Promise.all([maybeAlert(env, doc, run, false), maybeAlert(env, doc, run, false), maybeAlert(env, doc, run, false)]);
    expect(attempts).toBe(1);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
  });

  it("rollback does not clobber a state another caller moved meanwhile", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    setFetchForTests(async () => {
      // while this delivery is failing, a recovery elsewhere claims PASS
      await env.DB.prepare("UPDATE checks SET last_alerted_verdict = 'PASS' WHERE id = ?").bind(c.id).run();
      return new Response("no", { status: 500 });
    });
    const run = await insertRun(c.id, "am1", "FAIL");
    await maybeAlert(env, (await getCheck(env, c.id))!, run, false);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("PASS");
  });

  it("an undecryptable target is a recorded failure, not a silent skip", async () => {
    let fetched = 0;
    setFetchForTests(async () => {
      fetched++;
      return new Response("ok");
    });
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const row = await env.DB.prepare("SELECT alert_channels FROM checks WHERE id = ?").bind(c.id).first<{ alert_channels: string }>();
    const corrupted = JSON.parse(row!.alert_channels).map((ch: any) => ({ ...ch, target_encrypted: "garbage" }));
    await env.DB.prepare("UPDATE checks SET alert_channels = ? WHERE id = ?").bind(JSON.stringify(corrupted), c.id).run();
    const before = await failureCounter();
    const run = await insertRun(c.id, "ad1", "FAIL");
    await maybeAlert(env, (await getCheck(env, c.id))!, run, false);
    expect(fetched).toBe(0);
    expect(await alertsSent("ad1")).toEqual([{ kind: "slack", ok: false, error: "decrypt" }]);
    expect(await failureCounter()).toBe(before + 1);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
  });

  it("a redirecting webhook is a failure, not a follow", async () => {
    let redirectMode: string | undefined;
    setFetchForTests(async (_url, init) => {
      redirectMode = init?.redirect;
      return new Response(null, { status: 302, headers: { location: "https://evil.example/" } });
    });
    const r = await deliver(env as any, "slack", SLACK, "text");
    expect(redirectMode).toBe("manual");
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/302/);
  });
});

describe("formatAlert", () => {
  const ev = { state: "FAIL" as const, name: "Orders sync", message: "Run reported success, but the destination gained 0.", timestamp: "2026-08-28T21:13:56.996Z", link: "https://verifyruns.pages.dev/checks/abc" };
  it("slack keeps its markup and named link", () => {
    const t = formatAlert("slack", ev);
    expect(t).toContain(":rotating_light: *FAIL* — Orders sync");
    expect(t).toContain("<https://verifyruns.pages.dev/checks/abc|Open in VerifyRuns>");
  });
  it("discord gets bold, no slack shortcodes", () => {
    const t = formatAlert("discord", ev);
    expect(t).toContain("**FAIL** — Orders sync");
    expect(t).not.toContain(":rotating_light:");
    expect(t).toContain("https://verifyruns.pages.dev/checks/abc");
  });
  it("email is plain text: no shortcodes, no asterisks or underscores, a readable time and the link on its own line", () => {
    const t = formatAlert("email", { ...ev, state: "Recovered" });
    expect(t).not.toMatch(/:[a-z_]+:|\*|_At/);
    expect(t.split("\n")[0]).toBe("Recovered — Orders sync");
    expect(t).toContain("Run reported success, but the destination gained 0.");
    expect(t).toContain("At 2026-08-28 21:13 UTC");
    expect(t.split("\n").pop()).toBe("Open in VerifyRuns: https://verifyruns.pages.dev/checks/abc");
  });
});

describe("reported failure alerts without a retry", () => {
  it("first reported failure alerts on that run, pending_retry stays null; the next honest PASS recovers", async () => {
    const posts: any[] = [];
    setFetchForTests(async (url, init) => {
      if (url.startsWith("https://discord")) {
        posts.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      return jsonResponse(Array.from({ length: 3 }, (_, i) => ({ id: i + 1 })));
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, retry_before_alert: true, alert_channels: [{ kind: "discord", target: DISCORD }] });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS");
    const f = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "exit 143" } });
    expect(f.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(1);
    expect(posts[0].content).toContain("Your workflow reported failure: exit 143.");
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at).toBeNull();
    expect(await alertsSent(f.data.run_id)).toEqual([{ kind: "discord", ok: true }]);
    const ok = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(ok.data.verdict).toBe("PASS");
    expect(posts.length).toBe(2);
    expect(posts[1].content.startsWith("✅ **Recovered**")).toBe(true);
  });
});

describe("reported failure cancels a pending retry", () => {
  it("ordinary FAIL sets a retry → reported failure inside the window → drain sends no false Recovered", async () => {
    let n = 200;
    const posts: any[] = [];
    setFetchForTests(async (url, init) => {
      if (url.startsWith("https://discord")) {
        posts.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      return jsonResponse(Array.from({ length: n }, (_, i) => ({ id: i + 1 })));
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, retry_before_alert: true, alert_channels: [{ kind: "discord", target: DISCORD }] });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS");
    const f1 = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 5 } }); // destination gained 0 → ordinary FAIL, retry scheduled
    expect(f1.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(0);
    const due = (await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at;
    expect(typeof due).toBe("string");
    n = 205; // the destination catches up: a retry would now PASS
    const f2 = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "exit 1" } });
    expect(f2.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(1);
    expect(posts[0].content).toContain("🚨 **FAIL**");
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at).toBeNull();
    expect((await tick(env, new Date(Date.parse(due) + 60_000))).retries).toBe(0);
    expect(posts.length).toBe(1); // no Recovered
    const runs = (await api(`/checks/${c.id}/runs`, { token: u.token })).data;
    expect(runs.some((r: any) => r.trigger === "retry")).toBe(false);
  });
});

describe("reported error text is inert in chat channels", () => {
  it("discord payloads carry allowed_mentions: {parse: []}", async () => {
    let sent: any = null;
    setFetchForTests(async (url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(null, { status: 204 });
    });
    expect(await deliver(env, "discord", DISCORD, "@everyone hi")).toEqual({ ok: true });
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    expect(sent.content).toBe("@everyone hi");
  });
  it("slack text escapes <, > and & in the name and message, keeps the link markup", () => {
    const t = formatAlert("slack", { state: "FAIL", name: "a & b", message: "Your workflow reported failure: <!channel> <https://evil|x>.", timestamp: "2026-09-04T00:00:00.000Z", link: "https://app/checks/1" });
    expect(t).toContain("a &amp; b");
    expect(t).toContain("&lt;!channel&gt; &lt;https://evil|x&gt;.");
    expect(t).toContain("<https://app/checks/1|Open in VerifyRuns>");
    expect(slackEscape("<&>")).toBe("&lt;&amp;&gt;");
  });
});

describe("a claimed retry overtaken by a reported failure", () => {
  it("retry PASS during which a reported failure lands sends no Recovered", async () => {
    let n = 200;
    const posts: any[] = [];
    let gate: (() => void) | null = null;
    let gated: Promise<void> | null = null;
    setFetchForTests(async (url, init) => {
      if (url.startsWith("https://discord")) {
        posts.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      if (gated) {
        const g = gated;
        gated = null;
        await g; // hold the retry's destination read until the reported failure has landed
      }
      return jsonResponse(Array.from({ length: n }, (_, i) => ({ id: i + 1 })));
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, retry_before_alert: true, alert_channels: [{ kind: "discord", target: DISCORD }] });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS");
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 5 } })).data.verdict).toBe("FAIL");
    const due = (await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at;
    n = 205; // the retry would PASS
    gated = new Promise<void>((res) => (gate = res));
    const draining = tick(env, new Date(Date.parse(due) + 60_000)); // claims the retry, blocks in its read
    await new Promise((r) => setTimeout(r, 50));
    const f = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "exit 1" } });
    expect(f.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(1);
    gate!();
    expect((await draining).retries).toBe(1);
    const runs = (await api(`/checks/${c.id}/runs`, { token: u.token })).data;
    const retry = runs.find((r: any) => r.trigger === "retry");
    expect(retry.verdict).toBe("PASS");
    expect(posts.length).toBe(1); // no Recovered
    expect(retry.alerts_sent).toBeUndefined();
  });
});

