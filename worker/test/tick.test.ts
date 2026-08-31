import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setFetchForTests } from "../src/net";
import { claimLazyTick, drainPendingRuns, heartbeatDue, heartbeatMessage, heartbeatTick, tick } from "../src/tick";
import { executeCheck } from "../src/execute";
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

  it("a tick dying mid-drain leaves unfinished items queued; the next tick completes them", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const rs = [];
    for (let i = 0; i < 5; i++) rs.push(await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" }));
    let calls = 0;
    const dying: typeof executeCheck = async (...args) => {
      calls += 1;
      if (calls > 2) throw new Error("tick died");
      return executeCheck(...args);
    };
    await drainPendingRuns(env, undefined, dying);
    const left = (await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs;
    expect(left).toBe(3);
    expect((await runsOf(c.id, u.token)).length).toBe(2);
    await tick(env);
    const runs = await runsOf(c.id, u.token);
    expect(runs.length).toBe(5);
    expect(new Set(runs.map((x: any) => x.id))).toEqual(new Set(rs.map((r) => r.data.run_id)));
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs).toBe(0);
  });

  it("an item whose run is already recorded (eviction between execute and remove) is removed without a second fetch", async () => {
    let fetches = 0;
    setFetchForTests(async () => {
      fetches += 1;
      return jsonResponse(todos(3));
    });
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const a = await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" });
    // simulate the eviction: the run executed and was recorded, but the item was never removed
    await executeCheck(env, c.id, "webhook", a.data.run_id);
    const before = fetches;
    await tick(env);
    expect(fetches).toBe(before); // reconciled from the recorded run, no re-execution
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs).toBe(0);
    const runs = await runsOf(c.id, u.token);
    expect(runs.map((x: any) => x.id)).toEqual([a.data.run_id]); // exactly one, none missing
  });

  it("per-item removal leaves an item appended mid-drain in the queue", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" });
    const appended = { run_id: "late", claimed_new: null, body_note: null, queued_at: new Date().toISOString() };
    const appendDuringExecute: typeof executeCheck = async (...args) => {
      await env.DB.prepare("UPDATE checks SET pending_runs = json_insert(pending_runs, '$[#]', json(?)) WHERE id = ?").bind(JSON.stringify(appended), c.id).run();
      return executeCheck(...args);
    };
    await drainPendingRuns(env, undefined, appendDuringExecute);
    const doc = await api(`/checks/${c.id}`, { token: u.token });
    expect(doc.data.pending_runs).toBe(1); // the concurrent append survived the predicated removal
    await env.DB.prepare("UPDATE checks SET pending_runs = '[]' WHERE id = ?").bind(c.id).run(); // don't leak into later ticks
  });

  it("a queue longer than VR_TICK_BATCH drains in batches across ticks", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    for (let i = 0; i < 5; i++) await api(`/hook/${c.webhook_secret}?wait=0`, { method: "POST" });
    const small = { ...env, VR_TICK_BATCH: "2" } as any;
    expect((await tick(small)).queued).toBe(2);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.pending_runs).toBe(3);
    expect((await tick(small)).queued).toBe(2);
    expect((await tick(small)).queued).toBe(1);
    expect((await runsOf(c.id, u.token)).length).toBe(5);
  });

  it("the item budget is shared across Checks: each execution is a destination fetch", async () => {
    serve();
    const u = await user();
    const c1 = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    const c2 = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    for (let i = 0; i < 3; i++) await api(`/hook/${c1.webhook_secret}?wait=0`, { method: "POST" });
    for (let i = 0; i < 3; i++) await api(`/hook/${c2.webhook_secret}?wait=0`, { method: "POST" });
    const small = { ...env, VR_TICK_BATCH: "4" } as any;
    expect((await tick(small)).queued).toBe(4); // not 3 + 3
    expect((await tick(small)).queued).toBe(2);
    expect((await runsOf(c1.id, u.token)).length).toBe(3);
    expect((await runsOf(c2.id, u.token)).length).toBe(3);
  });

  it("the sweep's due-advance does not clobber a fresher value a run insert wrote mid-sweep", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, heartbeat_hours: 1 });
    const later = new Date(Date.now() + 2 * 3600_000);
    const fresher = new Date(Date.now() + 9 * 3600_000).toISOString();
    const db = new Proxy(env.DB, {
      get(t, p) {
        if (p === "prepare") {
          return (sql: string) => {
            const real = t.prepare(sql);
            if (!sql.includes("trigger != 'heartbeat' ORDER BY")) return real;
            // the anchor query is the seam: a webhook run lands here and re-anchors the due time
            return {
              bind: (...a: unknown[]) => {
                const b = real.bind(...a);
                return {
                  async first() {
                    await env.DB.prepare("UPDATE checks SET next_heartbeat_due_at = ? WHERE id = ?").bind(fresher, c.id).run();
                    return b.first();
                  },
                };
              },
            } as any;
          };
        }
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    expect(await heartbeatTick({ ...env, DB: db } as any, later)).toBe(1); // the heartbeat still fires
    const due = (await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string }>())!.next_heartbeat_due_at;
    expect(due).toBe(fresher); // the predicated advance stood down
  });

  it("a stale due column on a Check without a cadence heals instead of firing", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 } });
    await env.DB.prepare("UPDATE checks SET heartbeat_hours = NULL, next_heartbeat_due_at = ? WHERE id = ?").bind(new Date(Date.now() - 3600_000).toISOString(), c.id).run();
    expect(await heartbeatTick(env, new Date())).toBe(0);
    const row = await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string | null }>();
    expect(row!.next_heartbeat_due_at).toBeNull();
    expect((await runsOf(c.id, u.token)).length).toBe(0);
  });

  it("heartbeats are selected via next_heartbeat_due_at, and every trigger maintains the column", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, heartbeat_hours: 1 });
    const nextDue = async () => (await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string | null }>())!.next_heartbeat_due_at;
    const creationDue = await nextDue();
    expect(creationDue).toBeTruthy(); // seeded at creation: created_at + window
    // a real run pushes the due time forward
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const afterRun = await nextDue();
    expect(afterRun! > creationDue!).toBe(true);
    // a fired heartbeat advances it another window
    const later = new Date(Date.now() + 2 * 3600_000);
    expect((await tick(env, later)).heartbeats).toBe(1);
    const afterHb = await nextDue();
    expect(afterHb! > afterRun!).toBe(true);
    expect((await tick(env, later)).heartbeats).toBe(0); // advanced past `later`, not re-selected
    // changing the cadence recomputes; clearing it clears the column
    await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_hours: 48 } });
    const afterPatch = await nextDue();
    expect(afterPatch! > afterHb!).toBe(true);
    await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_hours: null } });
    expect(await nextDue()).toBeNull();
  });

  it("tick_last_ok_at is stamped on success and not by a tick that throws", async () => {
    serve();
    await tick(env);
    const okStamp = async () => (await env.DB.prepare("SELECT value FROM meta WHERE key = 'tick_last_ok_at'").first<{ value: string }>())?.value ?? null;
    const first = await okStamp();
    expect(first).toBeTruthy();
    const broken = {
      ...env,
      DB: new Proxy(env.DB, {
        get(t, p) {
          if (p === "prepare") {
            return (sql: string) => {
              if (sql.includes("DELETE FROM run_samples")) throw new Error("boom");
              return t.prepare(sql);
            };
          }
          const v = (t as any)[p];
          return typeof v === "function" ? v.bind(t) : v;
        },
      }),
    } as any;
    await expect(tick(broken)).rejects.toThrow("boom");
    expect(await okStamp()).toBe(first); // unchanged by the failed tick
  });

  it("migration 0003 backfill computes the due time from the latest real run", async () => {
    serve();
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, heartbeat_hours: 2 });
    await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    const runTs = (await env.DB.prepare("SELECT MAX(timestamp) AS ts FROM check_runs WHERE check_id = ?").bind(c.id).first<{ ts: string }>())!.ts;
    await env.DB.prepare("UPDATE checks SET next_heartbeat_due_at = NULL WHERE id = ?").bind(c.id).run();
    // replay the 0003 backfill statement
    await env.DB.prepare(
      `UPDATE checks SET next_heartbeat_due_at = strftime(
         '%Y-%m-%dT%H:%M:%fZ',
         MAX(
           COALESCE((SELECT MAX(timestamp) FROM check_runs WHERE check_id = checks.id AND "trigger" != 'heartbeat'), created_at),
           COALESCE((SELECT MAX(COALESCE(heartbeat_at, timestamp)) FROM check_runs WHERE check_id = checks.id AND "trigger" = 'heartbeat'), '')
         ),
         '+' || heartbeat_hours || ' hours'
       )
       WHERE heartbeat_hours IS NOT NULL AND heartbeat_hours > 0`,
    ).run();
    const due = (await env.DB.prepare("SELECT next_heartbeat_due_at FROM checks WHERE id = ?").bind(c.id).first<{ next_heartbeat_due_at: string }>())!.next_heartbeat_due_at;
    expect(due).toBe(new Date(new Date(runTs).getTime() + 2 * 3600_000).toISOString());
  });

  it("lazy tick claim wins once per window; the endpoint needs the secret; expiry sweep deletes old samples", async () => {
    const stale = new Date(Date.now() - 400_000).toISOString();
    await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(stale).run();
    expect(await claimLazyTick(env)).toBe(true);
    expect(await claimLazyTick(env)).toBe(false);
    expect((await api("/internal/tick", { method: "POST" })).status).toBe(401);
    expect((await api("/internal/tick", { method: "POST", headers: { "x-tick-secret": "wrong" } })).status).toBe(401);
    const r = await api("/internal/tick", { method: "POST", headers: { "x-tick-secret": "test-tick-secret" } });
    expect(r.status).toBe(200);
    expect(Object.keys(r.data).sort()).toEqual(["expired_runs", "expired_samples", "heartbeats", "queued", "retries"]);
    await env.DB.prepare("INSERT INTO run_samples (run_id, check_id, newest_record, newest_window, error_details, expires_at) VALUES ('old', 'c', '{}', '[]', NULL, ?)").bind(new Date(Date.now() - 1000).toISOString()).run();
    const swept = await tick(env);
    expect(swept.expired_samples).toBeGreaterThanOrEqual(1);
    expect(await env.DB.prepare("SELECT run_id FROM run_samples WHERE run_id = 'old'").first()).toBeNull();
  });

  it("traffic runs a lazy tick after the response", async () => {
    const stale = new Date(Date.now() - 400_000).toISOString();
    await env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(stale).run();
    await api("/plans");
    await new Promise((r) => setTimeout(r, 200));
    const last = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'tick_last_at'").first<{ value: string }>())!.value;
    expect(new Date(last).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
