import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setFetchForTests } from "../src/net";
import { api, jsonResponse, makeCheck, user } from "./helpers";
import { tick } from "../src/tick";

afterEach(() => setFetchForTests(null));

const todos = (n = 200) => Array.from({ length: n }, (_, i) => ({ userId: 1, id: i + 1, title: `t${i}`, completed: false }));
const serve = (n = 200) => setFetchForTests(async () => jsonResponse(todos(n)));
const runsOf = async (id: string, token: string) => (await api(`/checks/${id}/runs`, { token })).data;

describe("webhook + runs (parity with test_serverless / test_claimed_api / test_data_minimisation)", () => {
  it("runs inline and returns the verdict; the run exists immediately; ?wait accepted", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(r.status).toBe(200);
    expect(r.data.verdict).toBe("PASS");
    expect(r.data.timed_out).toBe(false);
    expect(r.data.diff_message.startsWith("First successful check")).toBe(true);
    const runs = await runsOf(c.id, u.token);
    expect(runs.map((x: any) => x.id)).toEqual([r.data.run_id]);
    expect(runs[0].trigger).toBe("webhook");
    expect((await api(`/hook/${c.webhook_secret}?wait=30`, { method: "POST" })).data.verdict).toBe("PASS");
    expect((await api(`/hook/nope`, { method: "POST" })).status).toBe(404);
  });

  it("GET /api/checks carries diff_message on every recent run; the public run shape is {id, verdict, timestamp, diff_message, trigger, alerts_sent}", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const list = await api("/checks", { token: u.token });
    expect(list.data[0].recent_runs.length).toBe(2);
    for (const run of list.data[0].recent_runs) {
      expect(Object.keys(run).sort()).toEqual(["diff_message", "id", "timestamp", "verdict"]);
      expect(typeof run.diff_message).toBe("string");
    }
    expect(list.data[0].recent_runs[0].diff_message.startsWith("First successful check")).toBe(true);
    const on = await api(`/checks/${c.id}/public`, { method: "POST", token: u.token });
    const pub = await api(`/public/checks/${on.data.public_token}`);
    for (const run of pub.data.runs) expect(Object.keys(run).sort()).toEqual(["alerts_sent", "diff_message", "id", "timestamp", "trigger", "verdict"]);
  });

  it("a capped Airtable fetch marks the stored fingerprint and the next run skips the growth rule", async () => {
    // every page returns one record and an offset forever, so the 40-page ceiling always trips
    setFetchForTests(async (url) => {
      const off = new URL(url).searchParams.get("offset") || "0";
      return jsonResponse({ records: [{ id: `rec${off}`, createdTime: "2026-01-01T00:00:00.000Z", fields: { a: 1 } }], offset: `p${off}` });
    });
    const u = await user();
    const r = await api("/checks", { method: "POST", token: u.token, json: { name: "at", connector_kind: "airtable", config: { base_id: "app1", table: "T" } } });
    expect(r.status).toBe(200);
    const first = await api(`/hook/${r.data.webhook_secret}`, { method: "POST" });
    expect(first.data.verdict).toBe("PASS");
    const stored = await env.DB.prepare("SELECT fingerprint FROM check_runs WHERE id = ?").bind(first.data.run_id).first<{ fingerprint: string }>();
    expect(JSON.parse(stored!.fingerprint).count_capped).toBe(true);
    const second = await api(`/hook/${r.data.webhook_secret}`, { method: "POST" });
    expect(second.data.verdict).toBe("PASS");
    expect(second.data.diff_message).toContain("Record-count checks were skipped: the count is capped.");
    expect(second.data.diff_message).toContain("Count capped at 4,000 records.");
  });

  it("claimed count from the body is stored and reconciled", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const first = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 0 } });
    expect(first.data.verdict).toBe("PASS");
    const second = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 2 } });
    expect(second.data.verdict).toBe("FAIL");
    expect(second.data.diff_message).toBe("Run reported success, but your workflow said it wrote 2 records; the destination gained 0.");
    const runs = await runsOf(c.id, u.token);
    expect(runs[0].claimed_new).toBe(2);
    const bad = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: "lots" } });
    expect(bad.status).toBe(200);
    expect((await runsOf(c.id, u.token))[0].body_note).toBe("webhook body ignored: `wrote` is not an integer");
  });

  it("?wait=0 queues: 202, no run yet, pending_runs counted", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const r = await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST", json: { wrote: 0 } });
    expect(r.status).toBe(202);
    expect(r.data).toEqual({ accepted: true, run_id: r.data.run_id, queued: true });
    expect(await runsOf(c.id, u.token)).toEqual([]);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs).toBe(1);
  });

  it("manual run is queued and lands; run detail is owner-only", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const r = await api(`/checks/${c.id}/run`, { method: "POST", token: u.token });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe("queued");
    let runs: any[] = [];
    for (let i = 0; i < 20 && !runs.length; i++) {
      await new Promise((res) => setTimeout(res, 100));
      runs = await runsOf(c.id, u.token);
    }
    expect(runs.length).toBe(1);
    expect(runs[0].id).toBe(r.data.run_id);
    expect(runs[0].trigger).toBe("manual");
    const other = await user("o");
    expect((await api(`/runs/${runs[0].id}`, { token: other.token })).status).toBe(404);
    expect((await api(`/runs/${runs[0].id}`, { token: u.token })).status).toBe(200);
  });

  it("default run stores a hash, not rows, and drops error bodies; opt-in keeps a sample", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const run = (await api(`/runs/${r.data.run_id}`, { token: u.token })).data;
    expect(run.fingerprint.newest_record).toBeUndefined();
    expect(run.fingerprint.newest_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(run.fingerprint.sample_stored).toBe(false);
    expect(run.sample).toBeUndefined();

    setFetchForTests(async () => new Response("{}", { status: 404 }));
    const bad = await makeCheck(u.token, { config: { url: "https://x/nope" } });
    const br = await api(`/hook/${bad.webhook_secret}`, { method: "POST" });
    expect(br.data.verdict).toBe("FAIL");
    expect(br.data.diff_message).toContain("HTTP 404");
    expect((await api(`/runs/${br.data.run_id}`, { token: u.token })).data.error_details).toBeNull();

    serve();
    const opt = await makeCheck(u.token, { expectations: { min_new_records: 0 }, store_samples: true });
    const orr = await api(`/hook/${opt.webhook_secret}`, { method: "POST" });
    const orun = (await api(`/runs/${orr.data.run_id}`, { token: u.token })).data;
    expect(orun.fingerprint.sample_stored).toBe(true);
    expect(orun.sample.newest_window.length).toBe(5);
    expect(typeof orun.sample.newest_record.id).toBe("number");
    expect(new Date(orun.sample.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
  });

  it("alerts: fresh FAIL with retry off posts to Discord once, records alerts_sent, recovers", async () => {
    const posts: { url: string; body: any }[] = [];
    let n = 200;
    setFetchForTests(async (url, init) => {
      if (url.startsWith("https://discord")) {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: 204 });
      }
      return jsonResponse(todos(n));
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, retry_before_alert: false, alert_channels: [{ kind: "discord", target: "https://discord.com/api/webhooks/1/abcd" }] });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS");
    const f1 = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(f1.data.verdict).toBe("FAIL");
    const f2 = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(f2.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(1);
    expect(posts[0].body.content.startsWith("🚨 **FAIL**")).toBe(true);
    expect((await api(`/runs/${f1.data.run_id}`, { token: u.token })).data.alerts_sent).toEqual([{ kind: "discord", ok: true }]);
    n = 203;
    const ok = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(ok.data.verdict).toBe("PASS");
    expect(posts.length).toBe(2);
    expect(posts[1].body.content.startsWith("✅ **Recovered**")).toBe(true);
  });

  it("fresh FAIL with retry on records pending_retry instead of alerting", async () => {
    const posts: string[] = [];
    setFetchForTests(async (url) => {
      if (url.startsWith("https://hooks.slack")) {
        posts.push(url);
        return new Response("ok");
      }
      return jsonResponse(todos());
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, alert_slack_webhook: "https://hooks.slack.com/services/T/B/x" });
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const f = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 2 } });
    expect(f.data.verdict).toBe("FAIL");
    expect(posts.length).toBe(0);
    const check = (await api(`/checks/${c.id}`, { token: u.token })).data;
    expect(typeof check.pending_retry_at).toBe("string");
  });
});

describe("reported failure (status: failed in the webhook body)", () => {
  it("is a FAIL with the sentence even when the destination is healthy; fields on the run read; fingerprint stored; heartbeat re-anchored", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, retry_before_alert: false, heartbeat_hours: 24 });
    const dueBefore = (await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string }>())!.next_heartbeat_due_at;
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "exit 1", wrote: 1 } });
    expect(r.status).toBe(200);
    expect(r.data.verdict).toBe("FAIL");
    expect(r.data.diff_message).toBe("Your workflow reported failure: exit 1.");
    const run = (await api(`/runs/${r.data.run_id}`, { token: u.token })).data;
    expect(run.reported_failure).toBe(true);
    expect(run.reported_error).toBe("exit 1");
    expect(run.claimed_new).toBe(1);
    expect(run.fingerprint.record_count).toBe(200);
    const nr = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true } });
    expect(nr.data.diff_message).toBe("Your workflow reported failure (no reason given).");
    expect((await api(`/runs/${nr.data.run_id}`, { token: u.token })).data.reported_error).toBeNull();
    const row = await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string }>();
    const lastRun = (await api(`/runs/${nr.data.run_id}`, { token: u.token })).data;
    expect(Date.parse(row!.next_heartbeat_due_at)).toBe(Date.parse(lastRun.timestamp) + 24 * 3600_000);
    expect(Date.parse(row!.next_heartbeat_due_at)).toBeGreaterThan(Date.parse(dueBefore));
    // ordinary runs carry the fields too
    const ok = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(ok.data.verdict).toBe("PASS");
    const okRun = (await api(`/runs/${ok.data.run_id}`, { token: u.token })).data;
    expect(okRun.reported_failure).toBe(false);
    expect(okRun.reported_error).toBeNull();
  });

  it("stays out of the PASS baseline: the next honest run is judged against earlier PASSes only", async () => {
    let n = 200;
    setFetchForTests(async () => jsonResponse(todos(n)));
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, retry_before_alert: false });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS"); // baseline 200
    n = 205;
    const f = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "half-written" } });
    expect(f.data.verdict).toBe("FAIL");
    // If the reported failure had joined the baseline (205), a run at 206 would only show +1.
    // Against the real baseline (200) it gains 6, which the claimed count checks exactly.
    n = 206;
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 6 } });
    expect(r.data.verdict).toBe("PASS");
    expect(r.data.diff_message).toContain("6");
  });

  it("failed: false is ignored; a queued (?wait=0) reported failure survives the tick", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, retry_before_alert: false });
    const ok = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: false, wrote: 0 } });
    expect(ok.data.verdict).toBe("PASS");
    const q = await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST", json: { failed: true, error: "queued boom" } });
    expect(q.status).toBe(202);
    await tick(env, new Date());
    const run = (await api(`/runs/${q.data.run_id}`, { token: u.token })).data;
    expect(run.verdict).toBe("FAIL");
    expect(run.diff_message).toBe("Your workflow reported failure: queued boom.");
    expect(run.reported_failure).toBe(true);
  });
});

describe("reported failure edge cases", () => {
  it("a non-boolean failed is noted on the run and judged on the destination; a bad wrote note is kept alongside", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, retry_before_alert: false });
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: "true", wrote: "lots" } });
    expect(r.data.verdict).toBe("PASS");
    const run = (await api(`/runs/${r.data.run_id}`, { token: u.token })).data;
    expect(run.reported_failure).toBe(false);
    expect(run.body_note).toBe("webhook body ignored: `wrote` is not an integer; webhook body ignored: `failed` is not a boolean");
  });

  it("when the destination cannot be read during a reported failure, the sentence says both", async () => {
    setFetchForTests(async () => new Response("nope", { status: 500 }));
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, retry_before_alert: false });
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { failed: true, error: "exit 2" } });
    expect(r.data.verdict).toBe("FAIL");
    expect(r.data.diff_message.startsWith("Your workflow reported failure: exit 2. Destination could not be read: ")).toBe(true);
    expect(r.data.diff_message.length).toBeGreaterThan("Your workflow reported failure: exit 2. Destination could not be read: ".length);
  });
});

