import { afterEach, describe, expect, it } from "vitest";
import { setFetchForTests } from "../src/net";
import { api, jsonResponse, makeCheck, user } from "./helpers";

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
    expect(posts[0].body.content.startsWith(":rotating_light: *FAIL*")).toBe(true);
    expect((await api(`/runs/${f1.data.run_id}`, { token: u.token })).data.alerts_sent).toEqual([{ kind: "discord", ok: true }]);
    n = 203;
    const ok = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(ok.data.verdict).toBe("PASS");
    expect(posts.length).toBe(2);
    expect(posts[1].body.content.startsWith(":white_check_mark: *Recovered*")).toBe(true);
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
