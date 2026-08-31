import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { deleteMe } from "../src/routes";
import { retentionSweep } from "../src/tick";
import { api, makeCheck, user } from "./helpers";

const DAY = 86400_000;
const iso = (daysAgo: number, seq = 0) => new Date(Date.now() - daysAgo * DAY + seq * 1000).toISOString();

/** Seed `n` runs for a Check, oldest first; `daysAgo` positions the oldest, one second apart. */
async function seedRuns(checkId: string, n: number, daysAgo: number, verdict = "PASS", idPrefix = "r") {
  const stmts = [];
  for (let i = 0; i < n; i++) {
    stmts.push(
      env.DB.prepare("INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint) VALUES (?, ?, ?, 'webhook', ?, 'm', '{}')").bind(
        `${idPrefix}-${checkId.slice(0, 6)}-${i}`, checkId, iso(daysAgo, i), verdict,
      ),
    );
  }
  await env.DB.batch(stmts);
}

const runCount = async (checkId: string, where = "") =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM check_runs WHERE check_id = ?${where}`).bind(checkId).first<{ n: number }>())!.n;

/** Sweep until the cursor has emptied twice: the first wrap may complete a partial rotation, the
 *  second is guaranteed to have covered every Check. */
async function fullRotation(e = env as any) {
  let wraps = 0;
  for (let i = 0; i < 100; i++) {
    await retentionSweep(e, new Date());
    const cur = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'retention_cursor'").first<{ value: string }>())?.value ?? "";
    if (cur === "" && ++wraps === 2) return;
  }
  throw new Error("cursor never completed a rotation");
}

describe("run retention sweep", () => {
  it("deletes rows older than the window beyond the floor; keeps the newest 35 regardless of age", async () => {
    const u = await user("rt");
    const busy = await makeCheck(u.token, {});
    await seedRuns(busy.id, 40, 120, "PASS", "old"); // beyond the 90-day window
    await seedRuns(busy.id, 10, 5, "PASS", "new");
    const oldOnly = await makeCheck(u.token, {});
    await seedRuns(oldOnly.id, 40, 120, "PASS", "aged");
    await fullRotation();
    // busy: newest 35 = 10 new + 25 old; the oldest 15 exceed age, row floor and PASS floor
    expect(await runCount(busy.id)).toBe(35);
    expect(await runCount(busy.id, " AND id LIKE 'new-%'")).toBe(10); // the recent ones all survive
    // a Check with only ancient rows keeps its newest 35
    expect(await runCount(oldOnly.id)).toBe(35);
  });

  it("a quiet Check under a heartbeat FAIL streak keeps its 30-PASS baseline", async () => {
    const u = await user("rq");
    const c = await makeCheck(u.token, {});
    await seedRuns(c.id, 30, 150, "PASS", "base"); // the baseline, far past the window
    await seedRuns(c.id, 35, 10, "FAIL", "hb"); // a recent FAIL streak fills the newest-rows floor
    await fullRotation();
    expect(await runCount(c.id, " AND verdict = 'PASS'")).toBe(30); // PASS floor held
    const baseline = (await env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT id FROM check_runs WHERE check_id = ? AND verdict = 'PASS' ORDER BY timestamp DESC LIMIT 30)").bind(c.id).first<{ n: number }>())!.n;
    expect(baseline).toBe(30); // the verdict engine still finds its window
  });

  it("the rotating cursor covers all Checks across successive ticks, batch respected", async () => {
    const u = await user("rc");
    const checks = [];
    for (let i = 0; i < 3; i++) checks.push(await makeCheck(u.token, {}));
    for (const c of checks) await seedRuns(c.id, 40, 120, "PASS", "cur");
    const small = { ...env, VR_TICK_BATCH: "2" } as any;
    await retentionSweep(small, new Date());
    const midCursor = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'retention_cursor'").first<{ value: string }>())?.value;
    expect(midCursor).toBeTruthy(); // partway through the rotation
    await fullRotation(small);
    for (const c of checks) expect(await runCount(c.id)).toBe(35); // nobody skipped
  });
});

describe("account deletion at scale", () => {
  it("300 Checks delete across chunked batches; the user row goes last, so a mid-way failure is retryable", async () => {
    const u = await user("dl");
    const now = new Date().toISOString();
    const stmts = [];
    for (let i = 0; i < 300; i++) {
      stmts.push(
        env.DB.prepare("INSERT INTO checks (id, user_id, name, connector_kind, config, expectations, webhook_secret, created_at) VALUES (?, ?, 'n', 'http_json', '{}', '{}', ?, ?)").bind(`delchk-${i}`, u.id, `delsec-${u.id}-${i}`, now),
      );
      stmts.push(
        env.DB.prepare("INSERT INTO check_runs (id, check_id, timestamp, trigger, verdict, diff_message, fingerprint) VALUES (?, ?, ?, 'webhook', 'PASS', 'm', '{}')").bind(`delrun-${i}`, `delchk-${i}`, now),
      );
    }
    for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));

    const delReq = () => new Request("http://api.test/api/auth/me", { method: "DELETE", headers: { authorization: `Bearer ${u.token}` } });
    // fail the second chunk mid-way
    let batches = 0;
    const failing = new Proxy(env.DB, {
      get(t, p) {
        if (p === "batch") {
          return (s: unknown[]) => {
            if (++batches === 2) throw new Error("boom");
            return t.batch(s as any);
          };
        }
        const v = (t as any)[p];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    await expect(deleteMe({ ...env, DB: failing } as any, delReq())).rejects.toThrow("boom");
    // the user row went last: the account is intact and loginable, so the delete can be retried
    expect((await api("/auth/login", { method: "POST", json: { email: u.email, password: "pass123" } })).status).toBe(200);
    const r2 = await deleteMe(env as any, delReq());
    expect(r2.status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM checks WHERE user_id = ?").bind(u.id).first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM check_runs WHERE check_id LIKE 'delchk-%'").first<{ n: number }>())!.n).toBe(0);
    expect(await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(u.id).first()).toBeNull();
  });
});
