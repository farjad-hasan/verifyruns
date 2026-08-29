import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { maybeAlert } from "../src/alerts";
import { getCheck } from "../src/checks";
import { RateLimiter } from "../src/egress";
import { setFetchForTests } from "../src/net";
import { enqueueRun, heartbeatTick, tick } from "../src/tick";
import { api, jsonResponse, makeCheck, user } from "./helpers";

afterEach(() => setFetchForTests(null));

const runsOf = async (id: string, token: string) => (await api(`/checks/${id}/runs`, { token })).data;
const SLACK = "https://hooks.slack.com/services/T/B/x";

/** Counts Slack deliveries; serves an empty list to any other URL. */
function countSlack() {
  const hits = { slack: 0 };
  setFetchForTests(async (url) => {
    if (String(url).startsWith(SLACK)) {
      hits.slack += 1;
      return new Response("ok");
    }
    return jsonResponse([]);
  });
  return hits;
}

describe("heartbeat under concurrent ticks", () => {
  it("two ticks at the same instant → one heartbeat run, one alert", async () => {
    const hits = countSlack();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, heartbeat_hours: 1, alert_channels: [{ kind: "slack", target: SLACK }] });
    const later = new Date(Date.now() + 2 * 3600_000);
    const fired = await Promise.all([heartbeatTick(env, later), heartbeatTick(env, later), heartbeatTick(env, later)]);
    expect(fired.reduce((a, b) => a + b, 0)).toBe(1);
    const runs = await runsOf(c.id, u.token);
    expect(runs.filter((r: any) => r.trigger === "heartbeat").length).toBe(1);
    expect(hits.slack).toBe(1);
  });
});

describe("queued webhooks under concurrency", () => {
  it("ten parallel ?wait=0 webhooks are all queued and all executed by the next tick", async () => {
    setFetchForTests(async () => jsonResponse([{ id: 1 }]));
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const rs = await Promise.all(Array.from({ length: 10 }, () => api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" })));
    expect(rs.every((r) => r.status === 202)).toBe(true);
    const queued = (await getCheck(env, c.id))!.pending_runs;
    expect(queued.length).toBe(10);
    await tick(env);
    const runs = await runsOf(c.id, u.token);
    expect(runs.length).toBe(10);
    expect(new Set(runs.map((r: any) => r.id))).toEqual(new Set(rs.map((r) => r.data.run_id)));
  });

  it("enqueueRun appends without reading: a seeded item survives", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    const seeded = { run_id: "seed", claimed_new: null, body_note: null, queued_at: "2026-08-30T00:00:00.000Z" };
    await env.DB.prepare("UPDATE checks SET pending_runs = ? WHERE id = ?").bind(JSON.stringify([seeded]), c.id).run();
    await enqueueRun(env, c.id, { run_id: "new", claimed_new: 3, body_note: null, queued_at: "2026-08-30T00:00:01.000Z" });
    const q = (await getCheck(env, c.id))!.pending_runs;
    expect(q.map((x) => x.run_id)).toEqual(["seed", "new"]);
    expect(q[1].claimed_new).toBe(3);
  });
});

describe("alert transition under concurrency", () => {
  it("two maybeAlerts for the same fresh FAIL deliver once; the recovery is claimed once too", async () => {
    const hits = countSlack();
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const doc = (await getCheck(env, c.id))!;
    const run = { id: "r1", verdict: "FAIL", diff_message: "boom", timestamp: new Date().toISOString() };
    await env.DB.prepare("INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint) VALUES ('r1', ?, ?, 'webhook', 'FAIL', 'boom', '{}')").bind(c.id, run.timestamp).run();
    await Promise.all([maybeAlert(env, doc, run, false), maybeAlert(env, doc, run, false), maybeAlert(env, doc, run, false)]);
    expect(hits.slack).toBe(1);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("FAIL");
    const ok = { id: "r2", verdict: "PASS", diff_message: "fine", timestamp: new Date().toISOString() };
    await env.DB.prepare("INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint) VALUES ('r2', ?, ?, 'webhook', 'PASS', 'fine', '{}')").bind(c.id, ok.timestamp).run();
    const fresh = (await getCheck(env, c.id))!;
    await Promise.all([maybeAlert(env, fresh, ok, false), maybeAlert(env, fresh, ok, false)]);
    expect(hits.slack).toBe(2);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("PASS");
  });

  it("a snoozed Check does not move state even when the transition is fresh", async () => {
    const hits = countSlack();
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const doc = (await getCheck(env, c.id))!;
    await maybeAlert(env, doc, { id: "x", verdict: "FAIL", diff_message: "m", timestamp: new Date().toISOString() }, true);
    expect(hits.slack).toBe(0);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
  });
});

describe("RateLimiter memory", () => {
  it("forgets keys whose window has emptied", () => {
    let t = 1000;
    const rl = new RateLimiter(5, 60, () => t);
    for (let i = 0; i < 1000; i++) rl.allow(`secret-${i}`);
    expect(rl.size).toBe(1000);
    t += 61;
    rl.allow("fresh");
    expect(rl.size).toBe(1);
  });
});
