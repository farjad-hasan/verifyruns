import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setFetchForTests } from "../src/net";
import * as r from "../src/routes";
import { api, jsonResponse, makeCheck, user } from "./helpers";

/** env whose DB counts prepared statements, so the test pins the query shape, not just the output. */
function counting() {
  let n = 0;
  const db = new Proxy(env.DB, { get: (t, k) => (k === "prepare" ? (...a: any[]) => (n++, (t as any).prepare(...a)) : (t as any)[k]) });
  return { env: { ...env, DB: db } as any, count: () => n };
}

describe("GET /api/checks", () => {
  it("lists N checks with their last 30 runs in a constant number of statements, oldest → newest per check", async () => {
    setFetchForTests(async () => jsonResponse([{ id: 1 }]));
    const u = await user();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await makeCheck(u.token, { name: `c${i}`, expectations: { min_new_records: 0 } })).id);
    // 35 runs on the first check, 2 on the second, none on the rest
    const c0 = (await api(`/checks/${ids[0]}`, { token: u.token })).data;
    for (let i = 0; i < 35; i++) await api(`/hook/${c0.webhook_secret}`, { method: "POST" });
    const c1 = (await api(`/checks/${ids[1]}`, { token: u.token })).data;
    for (let i = 0; i < 2; i++) await api(`/hook/${c1.webhook_secret}`, { method: "POST" });
    setFetchForTests(null);

    const { env: cenv, count } = counting();
    const res = await r.listChecks(cenv, new Request("http://api.test/api/checks", { headers: { authorization: `Bearer ${u.token}` } }));
    const list = await res.json<any[]>();
    expect(list.length).toBe(5);
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId[ids[0]].recent_runs.length).toBe(30);
    expect(byId[ids[1]].recent_runs.length).toBe(2);
    expect(byId[ids[2]].recent_runs).toEqual([]);
    expect(byId[ids[2]].last_verdict).toBeNull();
    expect(byId[ids[0]].last_verdict).toBe("PASS");
    const ts = byId[ids[0]].recent_runs.map((x: any) => x.timestamp);
    expect([...ts].sort()).toEqual(ts); // oldest → newest
    expect(list[0].webhook_secret).toBeUndefined();
    expect(count()).toBeLessThanOrEqual(3); // user lookup + checks + runs — not one statement per check
  });
});
