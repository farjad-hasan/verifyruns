import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setFetchForTests } from "../src/net";
import { computeVerdict, fingerprint, parseClaimed } from "../src/engine";
import { drainRetries } from "../src/tick";
import { api, jsonResponse, makeCheck, user } from "./helpers";
import { testChannel } from "../src/routes";
import { encryptSecret } from "../src/crypto";
import { fetchRecords } from "../src/connectors";
afterEach(() => setFetchForTests(null));
const hook = (c: any, body?: unknown) => api(`/hook/${c.webhook_secret}`, { method: "POST", json: body });
const rows = (n: number) => Array.from({length: n}, (_, id) => ({id, email: "present"}));

describe("alpha verification contract", () => {
  it("rejects malformed JSON before it can drop a claim or queue a weaker run", async () => {
    const u=await user();const c=await makeCheck(u.token,{expectations:{min_new_records:0}});
    const r=await api(`/hook/${c.webhook_secret}?wait=0`,{method:"POST",body:"{bad",headers:{"content-type":"application/json"}});
    expect(r.status).toBe(422);expect((await api(`/checks/${c.id}/runs`,{token:u.token})).data).toEqual([]);
    expect((await api(`/checks/${c.id}`,{token:u.token})).data.pending_runs).toBe(0);
  });
  it("requires a baseline, detects no-op, verifies growth, and never lends failed-batch writes to another claim", async () => {
    let count = 100;
    setFetchForTests(async () => jsonResponse(rows(count)));
    const u = await user(); const c = await makeCheck(u.token, {retry_before_alert: false});
    const baseline = await hook(c);
    expect(baseline.data.verdict).toBe("FAIL"); expect(baseline.data.diff_message).toContain("Baseline recorded at 100");
    expect((await hook(c)).data.diff_message).toContain("gained 0 records");
    count = 103; expect((await hook(c, {wrote: 3})).data.verdict).toBe("PASS");
    count = 105; expect((await hook(c, {wrote: 4})).data.verdict).toBe("FAIL");
    count = 107; const next = await hook(c, {wrote: 4});
    expect(next.data.verdict).toBe("FAIL"); expect(next.data.diff_message).toContain("destination gained 2");
    const run = (await api(`/runs/${next.data.run_id}`, {token: u.token})).data;
    expect(run.fingerprint.count_baseline.record_count).toBe(105);
    expect(run.fingerprint.newest_record).toBeUndefined();
  });
  it("retries the original interval and cancels stale retries when configuration changes", async () => {
    let count = 100; setFetchForTests(async () => jsonResponse(rows(count)));
    const u = await user(); const c = await makeCheck(u.token);
    await hook(c); count = 102; await hook(c, {wrote: 5});
    let check = (await api(`/checks/${c.id}`, {token: u.token})).data;
    expect(check.pending_retry_at).toBeTruthy(); count = 105;
    await drainRetries(env, new Date(Date.parse(check.pending_retry_at) + 1));
    const runs = (await api(`/checks/${c.id}/runs`, {token: u.token})).data;
    expect(runs[0].trigger).toBe("retry"); expect(runs[0].verdict).toBe("PASS");
    expect(runs[0].fingerprint.count_baseline.record_count).toBe(100);
    await hook(c, {wrote: 1});
    check = (await api(`/checks/${c.id}`, {token: u.token})).data;
    await api(`/checks/${c.id}`, {method: "PATCH", token: u.token, json: {config: {url: "https://example.com/new"}}});
    expect(await drainRetries(env, new Date(Date.parse(check.pending_retry_at) + 1))).toBe(0);
    expect((await hook(c)).data.diff_message).toContain("Baseline recorded");
  });
  it("does not establish a count from an unreadable destination or accept malformed claims", async () => {
    let unavailable = true;
    setFetchForTests(async () => unavailable ? new Response("bad", {status: 503}) : jsonResponse(rows(5)));
    const u = await user(); const c = await makeCheck(u.token, {retry_before_alert: false});
    expect((await hook(c)).data.verdict).toBe("FAIL"); unavailable = false;
    expect((await hook(c)).data.diff_message).toContain("Baseline recorded at 5");
    await api(`/checks/${c.id}`, {method: "PATCH", token: u.token, json: {expectations: {min_new_records: 0}}});
    expect((await hook(c, {wrote: "lots"})).data.diff_message).toContain("Verification incomplete");
    expect(parseClaimed({wrote: "9999999999999999999999999"})[0]).toBeNull();
  });
  it("missing or unorderable configured non-empty fields never pass; optional growth is explicit", () => {
    for (const fp of [fingerprint([]), fingerprint([{id: 1}]), fingerprint([{email: "ok"}], 1, false)]) {
      expect(computeVerdict(fp, [], {min_new_records: 0, non_empty_fields: ["email"]})[0]).toBe("FAIL");
    }
    expect(computeVerdict(fingerprint(rows(1)), [], {min_new_records: 0})[1]).toContain("No record-growth requirement");
    expect(computeVerdict(fingerprint(rows(8)), [], {min_new_records: 1}, 2, {record_count: 5})[0]).toBe("PASS"); // at least, not exact
  });
});

describe("independent alert test", () => {
  it.each(["slack", "discord"])("tests %s without changing runs, incident state or heartbeat; enforces ownership", async kind => {
    const posts: any[] = [];
    setFetchForTests(async (_url, init) => { posts.push(JSON.parse(String(init?.body))); return new Response(null, {status: 204}); });
    const u = await user(); const other = await user();
    const c = await makeCheck(u.token, {name: "<!channel>", heartbeat_hours: 24, alert_channels: [{kind, target: "https://example.com/hook"}]});
    const path = `/checks/${c.id}/channels/${c.alert_channels[0].id}/test`;
    const before = await env.DB.prepare("SELECT * FROM checks WHERE id = ?").bind(c.id).first();
    expect((await api(path, {method: "POST"})).status).toBe(401);
    expect((await api(path, {method: "POST", token: other.token})).status).toBe(404);
    const result = await api(path, {method: "POST", token: u.token});
    expect(result.status).toBe(200); expect(result.data.message).toContain("Confirm it arrived");
    expect(posts).toHaveLength(1);
    if (kind === "slack") expect(posts[0].text).toContain("&lt;!channel&gt;");
    else expect(posts[0].allowed_mentions).toEqual({parse: []});
    expect(await env.DB.prepare("SELECT * FROM checks WHERE id = ?").bind(c.id).first()).toEqual(before);
    expect((await api(`/checks/${c.id}/runs`, {token: u.token})).data).toEqual([]);
    setFetchForTests(async () => new Response("secret-provider-body", {status: 400}));
    const failed = await api(path, {method: "POST", token: u.token});
    expect(failed.status).toBe(502); expect(JSON.stringify(failed.data)).not.toContain("secret-provider-body");
  });
});

describe("Airtable newest-row evidence", () => {
  it("fetches all five newest rows beyond page one and fails coverage when one is unavailable", async () => {
    let missing = false; const fetched: string[] = [];
    setFetchForTests(async (url, init) => {
      expect(init?.redirect).toBe("manual"); const u = new URL(url); const last = u.pathname.split("/").at(-1)!;
      if (last.startsWith("rec")) { fetched.push(last); return missing ? new Response("bad", {status: 503}) : jsonResponse({id:last, createdTime:"2026-02-01", fields:{email:""}}); }
      if (!u.searchParams.has("offset")) return jsonResponse({records:[{id:"old", createdTime:"2026-01-01", fields:{email:"ok"}}], offset:"next"});
      return jsonResponse({records:Array.from({length:5}, (_,id)=>({id:`rec${id}`, createdTime:"2026-02-01", fields:{}}))});
    });
    const cfg = {base_id:"appX", table:"T"};
    const complete = await fetchRecords(env, "airtable", cfg);
    expect(fetched).toHaveLength(5); expect(complete.meta?.newest_defined).toBe(true);
    expect(computeVerdict(fingerprint(complete.records!, complete.meta!.total, complete.meta!.newest_defined), [], {min_new_records:0, non_empty_fields:["email"]})[1]).toContain("5 of the 5 newest");
    missing = true;
    const incomplete = await fetchRecords(env, "airtable", cfg);
    expect(incomplete.meta?.newest_defined).toBe(false);
  });
});


describe("configured email delivery test", () => {
  it("uses the stored recipient and configured sender, without exposing provider errors", async () => {
    const u = await user(); const c = await makeCheck(u.token);
    const encrypted = await encryptSecret(env.ENC_KEY, "reviewer@example.test");
    await env.DB.prepare("UPDATE checks SET alert_channels = ? WHERE id = ?").bind(JSON.stringify([{id:"email-test", kind:"email", target_encrypted:encrypted}]),c.id).run();
    let sent: any;
    setFetchForTests(async (url, init) => {expect(url).toBe("https://api.resend.com/emails");sent=JSON.parse(String(init?.body));return jsonResponse({id:"accepted"});});
    const result = await testChannel({...env, RESEND_API_KEY:"fixture-key", ALERT_FROM:"VerifyRuns <alpha@example.test>", VR_EMAIL_ALERTS:"1"}, new Request("http://api.test", {headers:{authorization:"Bearer "+u.token}}), c.id, "email-test");
    expect(result.status).toBe(200);expect(sent.to).toEqual(["reviewer@example.test"]);expect(sent.from).toContain("alpha@example.test");expect(sent.subject).toContain("test alert");
    expect((await api(`/checks/${c.id}/runs`,{token:u.token})).data).toEqual([]);
  });
});
