import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setFetchForTests } from "../src/net";
import { claimLazyTick, heartbeatDue, heartbeatMessage, tick } from "../src/tick";
import { api, jsonResponse, makeCheck, user } from "./helpers";

afterEach(() => setFetchForTests(null));

const todos = (n = 200) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `t${i}` }));
const serve = (n = 200) => setFetchForTests(async () => jsonResponse(todos(n)));
const runsOf = async (id: string, token: string) => (await api(`/checks/${id}/runs`, { token })).data;
const T0 = new Date("2026-08-27T12:00:00.000Z");
const plus = (d: Date, h: number) => new Date(d.getTime() + h * 3600_000);

describe("heartbeat (pure)", () => {
  it("due after the window, not inside, not again until another window since the last heartbeat", () => {
    expect(heartbeatDue(24, T0.toISOString(), null, plus(T0, 23))).toBe(false);
    expect(heartbeatDue(24, T0.toISOString(), null, plus(T0, 25))).toBe(true);
    const lastHb = plus(T0, 25).toISOString();
    expect(heartbeatDue(24, T0.toISOString(), lastHb, plus(T0, 30))).toBe(false);
    expect(heartbeatDue(24, T0.toISOString(), lastHb, plus(T0, 50))).toBe(true);
    expect(heartbeatDue(null, T0.toISOString(), null, plus(T0, 720))).toBe(false);
  });
  it("message wording", () => {
    expect(heartbeatMessage(26.4, 24)).toBe("No run in 26 h — expected one every 24 h.");
    expect(heartbeatMessage(1.6, 1)).toBe("No run in 2 h — expected one every 1 h.");
  });
});

describe("tick (D1)", () => {
  it("missed window → one heartbeat FAIL per window; a real run re-anchors", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, heartbeat_hours: 1 });
    const later = new Date(Date.now() + 2 * 3600_000);
    await tick(env, later);
    let runs = await runsOf(c.id, u.token);
    expect(runs.length).toBe(1);
    expect(runs[0].trigger).toBe("heartbeat");
    expect(runs[0].verdict).toBe("FAIL");
    expect(runs[0].diff_message).toBe("No run in 2 h — expected one every 1 h.");
    await tick(env, later);
    expect((await runsOf(c.id, u.token)).length).toBe(1);
    await tick(env, plus(later, 2));
    expect((await runsOf(c.id, u.token)).length).toBe(2);
    const r = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(r.data.verdict).toBe("PASS");
    await tick(env, new Date(Date.now() + 60_000));
    runs = await runsOf(c.id, u.token);
    expect(runs.length).toBe(3);
    expect(runs[0].trigger).toBe("webhook");
  });

  it("drains queued runs exactly once, in order", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const a = await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST", json: { wrote: 0 } });
    const b = await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" });
    expect(a.status).toBe(202);
    const res = await tick(env);
    expect(res.queued).toBe(2);
    const runs = await runsOf(c.id, u.token);
    expect(runs.map((x: any) => x.id).sort()).toEqual([a.data.run_id, b.data.run_id].sort());
    expect(runs.every((x: any) => x.trigger === "webhook")).toBe(true);
    expect((await tick(env)).queued).toBe(0);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs).toBe(0);
  });

  it("drains a due retry with the original claim, once", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 1 }, retry_before_alert: true });
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const f = await api(`/hook/${c.webhook_secret}`, { method: "POST", json: { wrote: 2 } });
    expect(f.data.verdict).toBe("FAIL");
    const due = new Date((await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at);
    expect((await tick(env, new Date(due.getTime() - 5000))).retries).toBe(0);
    expect((await tick(env, new Date(due.getTime() + 1000))).retries).toBe(1);
    const runs = await runsOf(c.id, u.token);
    expect(runs.length).toBe(3);
    expect(runs[0].trigger).toBe("retry");
    expect(runs[0].is_retry).toBe(true);
    expect(runs[0].claimed_new).toBe(2);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_retry_at).toBeNull();
    expect((await tick(env, new Date(due.getTime() + 60_000))).retries).toBe(0);
  });

  it("lazy tick claim wins once per window; the endpoint needs the secret; expiry sweep deletes old samples", async () => {
    const stale = new Date(Date.now() - 120_000).toISOString();
    await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(stale).run();
    expect(await claimLazyTick(env)).toBe(true);
    expect(await claimLazyTick(env)).toBe(false);
    expect((await api("/internal/tick", { method: "POST" })).status).toBe(401);
    expect((await api("/internal/tick", { method: "POST", headers: { "x-tick-secret": "wrong" } })).status).toBe(401);
    const r = await api("/internal/tick", { method: "POST", headers: { "x-tick-secret": "test-tick-secret" } });
    expect(r.status).toBe(200);
    expect(Object.keys(r.data).sort()).toEqual(["expired_samples", "heartbeats", "queued", "retries"]);
    await env.DB.prepare("INSERT INTO run_samples (run_id, check_id, newest_record, newest_window, error_details, expires_at) VALUES ('old', 'c', '{}', '[]', NULL, ?)").bind(new Date(Date.now() - 1000).toISOString()).run();
    const swept = await tick(env);
    expect(swept.expired_samples).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare("SELECT run_id FROM run_samples WHERE run_id = 'old'").first()).toBeNull();
  });

  it("traffic runs a lazy tick after the response", async () => {
    const stale = new Date(Date.now() - 120_000).toISOString();
    await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(stale).run();
    await api("/plans");
    await new Promise((r) => setTimeout(r, 200));
    const last = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'tick_last_at'").first<{ value: string }>())!.value;
    expect(new Date(last).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
