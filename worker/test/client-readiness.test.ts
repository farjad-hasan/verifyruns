import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, jsonResponse, makeCheck, user } from "./helpers";
import { sha256Hex } from "../src/crypto";
import { resetPassword } from "../src/reset";
import { drainAlerts, maybeAlert, queueAlertStatements } from "../src/alerts";
import { getCheck } from "../src/checks";
import { drainPendingRuns, enqueueRun, retentionSweep } from "../src/tick";
import { executeCheck } from "../src/execute";
import { setFetchForTests } from "../src/net";
import { runNow } from "../src/routes";
import type { Env } from "../src/env";

afterEach(() => setFetchForTests(null));
const SLACK = "https://hooks.slack.com/services/review/test";
const expired = "1970-01-01T00:00:00.000Z";
const outbox = async (id: string) => (await env.DB.prepare("SELECT * FROM alert_outbox WHERE check_id = ? ORDER BY seq").bind(id).all<any>()).results;
const expireLease = async (id: string) => env.DB.prepare("UPDATE alert_outbox SET lease_until = ?, next_attempt_at = ? WHERE check_id = ?").bind(expired, expired, id).run();
async function insertRun(checkId: string, id: string, verdict = "FAIL") {
  const run = { id, verdict, diff_message: "test failure", timestamp: new Date().toISOString() };
  await env.DB.prepare("INSERT INTO check_runs(id,check_id,timestamp,trigger,verdict,diff_message,fingerprint) VALUES (?,?,?,'webhook',?,?,'{}')").bind(id,checkId,run.timestamp,verdict,run.diff_message).run();
  return run;
}
function batchEnv(batch: D1Database["batch"]): Env {
  return { ...env, DB: new Proxy(env.DB, { get(target, prop) { if (prop === "batch") return batch; const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } }) };
}
async function seedReset(userId: string, token: string) {
  await env.DB.prepare("INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256Hex(token),userId,new Date(Date.now()+3600_000).toISOString()).run();
}
const resetRequest = (token: string) => new Request("https://api.test/api/auth/reset", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,password:"new-password"})});

describe("atomic password reset", () => {
  it("accepts exactly one concurrent use and keeps the winner's session valid", async () => {
    const u = await user(); const token = "concurrent-reset";
    await seedReset(u.id,token);
    const results = await Promise.all(["password-a", "password-b"].map(password => api("/auth/reset",{method:"POST",json:{token,password}})));
    expect(results.map(r=>r.status).sort()).toEqual([200,400]);
    const winner = results.findIndex(r=>r.status===200);
    expect((await api("/auth/me",{token:results[winner].data.token})).status).toBe(200);
    expect((await api("/auth/login",{method:"POST",json:{email:u.email,password:["password-a","password-b"][winner]}})).status).toBe(200);
    expect((await env.DB.prepare("SELECT token_version FROM users WHERE id=?").bind(u.id).first<any>()).token_version).toBe(1);
  });
  it.each(["invalidate", "expire"])("refuses a token that becomes %s while hashing without deleting a newer link", async (mode) => {
    const u = await user(); const token = `race-${mode}`;
    await seedReset(u.id,token);
    const wrapped = batchEnv(async statements => {
      if (mode === "invalidate") await env.DB.prepare("DELETE FROM password_resets WHERE user_id=?").bind(u.id).run();
      else await env.DB.prepare("UPDATE password_resets SET expires_at=? WHERE user_id=?").bind(expired,u.id).run();
      await seedReset(u.id,`newer-${mode}`);
      return env.DB.batch(statements);
    });
    await expect(resetPassword(wrapped,resetRequest(token))).rejects.toMatchObject({status:400});
    expect((await api("/auth/me",{token:u.token})).status).toBe(200);
    expect((await env.DB.prepare("SELECT used_at FROM password_resets WHERE token_hash=?").bind(await sha256Hex(`newer-${mode}`)).first<any>()).used_at).toBeNull();
  });
  it("rolls token consumption back if the password transaction fails", async () => {
    const u = await user(); await seedReset(u.id,"rollback-reset");
    const broken = batchEnv(statements => env.DB.batch([...statements,env.DB.prepare("INSERT INTO nonexistent_table VALUES (1)")]));
    await expect(resetPassword(broken,resetRequest("rollback-reset"))).rejects.toThrow();
    expect((await env.DB.prepare("SELECT used_at FROM password_resets WHERE user_id=?").bind(u.id).first<any>()).used_at).toBeNull();
    expect((await api("/auth/me",{token:u.token})).status).toBe(200);
    expect((await resetPassword(env,resetRequest("rollback-reset"))).status).toBe(200);
  });
});

describe("recoverable alert outbox", () => {
  it("does not enqueue a retry recovery overtaken immediately before its transaction", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { expectations: { min_new_records: 0 }, alert_channels: [{ kind: "slack", target: SLACK }] });
    await env.DB.prepare("UPDATE checks SET last_alerted_verdict='FAIL' WHERE id=?").bind(c.id).run();
    setFetchForTests(() => jsonResponse([{ id: 1 }]));
    let injected = false;
    const wrapped = batchEnv(async statements => {
      if (!injected) { injected = true; await insertRun(c.id, "newer-failure"); }
      return env.DB.batch(statements);
    });
    await executeCheck(wrapped, c.id, "retry", "overtaken-recovery", true);
    expect(await outbox(c.id)).toHaveLength(0);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBe("FAIL");
  });
  it("rolls back the verdict and transition together if enqueue cannot commit", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { retry_before_alert: false, alert_channels: [{ kind: "slack", target: SLACK }] });
    setFetchForTests(() => jsonResponse([]));
    const broken = batchEnv(statements => env.DB.batch([...statements, env.DB.prepare("INSERT INTO nonexistent_table VALUES (1)")]));
    await expect(executeCheck(broken, c.id, "webhook", "uncommitted-run", false, null, null, { failed: true, error: "failed" })).rejects.toThrow();
    expect(await env.DB.prepare("SELECT id FROM check_runs WHERE id='uncommitted-run'").first()).toBeNull();
    expect(await outbox(c.id)).toHaveLength(0);
    expect((await getCheck(env, c.id))!.last_alerted_verdict).toBeNull();
  });
  it("does not resend durable provider acceptance after the final acknowledgement is interrupted", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { alert_channels: [{ kind: "slack", target: SLACK }] });
    const run = await insertRun(c.id, "accepted-alert");
    const broken = { ...env, DB: new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") return (sql: string) => {
          if (sql.startsWith("DELETE FROM alert_outbox")) throw new Error("interrupted final acknowledgement");
          return target.prepare(sql);
        };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) };
    let sent = 0;
    setFetchForTests(() => { sent++; return new Response("ok"); });
    await maybeAlert(broken, (await getCheck(env, c.id))!, run, false);
    expect(await outbox(c.id)).toHaveLength(1);
    await expireLease(c.id);
    expect(await drainAlerts(env)).toBe(1);
    expect(sent).toBe(1);
  });
  it("retries without another workflow after provider refusal and DB acknowledgement failure", async () => {
    const u = await user(); const c = await makeCheck(u.token,{alert_channels:[{kind:"slack",target:SLACK}]});
    const run = await insertRun(c.id,"interrupted-alert");
    let batches=0,attempts=0;
    const broken=batchEnv(statements=>{if(++batches===2)throw new Error("database interrupted");return env.DB.batch(statements)});
    setFetchForTests(()=>{attempts++;return new Response("unavailable",{status:503})});
    await maybeAlert(broken,(await getCheck(env,c.id))!,run,false);
    expect(attempts).toBe(1);expect(await outbox(c.id)).toHaveLength(1);
    await expireLease(c.id);
    setFetchForTests(()=>{attempts++;return new Response("ok")});
    expect(await drainAlerts(env)).toBe(1);
    expect(attempts).toBe(2);expect(await outbox(c.id)).toHaveLength(0);
    expect(JSON.parse((await env.DB.prepare("SELECT alerts_sent FROM check_runs WHERE id=?").bind(run.id).first<any>()).alerts_sent)).toEqual([{kind:"slack",ok:true}]);
  });
  it("persists the verdict and notification atomically, then resumes after no initial delivery", async () => {
    const u=await user();const c=await makeCheck(u.token,{expectations:{min_new_records:0},retry_before_alert:false,alert_channels:[{kind:"slack",target:SLACK}]});
    setFetchForTests(url=>url===SLACK?new Response("no",{status:500}):jsonResponse([]));
    await executeCheck(env,c.id,"webhook","atomic-alert",false,null,null,{failed:true,error:"failed"});
    expect(await outbox(c.id)).toHaveLength(1);
    expect((await env.DB.prepare("SELECT verdict FROM check_runs WHERE id='atomic-alert'").first<any>()).verdict).toBe("FAIL");
    await expireLease(c.id);setFetchForTests(()=>new Response("ok"));
    expect(await drainAlerts(env)).toBe(1);
  });
  it("two drainers deliver once and recovery cannot overtake a refused FAIL", async () => {
    const u=await user();const c=await makeCheck(u.token,{alert_channels:[{kind:"slack",target:SLACK}]});
    const doc=(await getCheck(env,c.id))!;
    const f=await insertRun(c.id,"ordered-fail"),p=await insertRun(c.id,"ordered-pass","PASS");
    await env.DB.batch(queueAlertStatements(env,doc,f,false));
    await env.DB.batch(queueAlertStatements(env,doc,p,false));
    // A duplicate enqueue of an older still-pending run cannot roll state backward.
    await env.DB.batch(queueAlertStatements(env,doc,f,false));
    expect((await getCheck(env,c.id))!.last_alerted_verdict).toBe("PASS");
    expect(await outbox(c.id)).toHaveLength(2);
    let sent:string[]=[];setFetchForTests((_url,init)=>{sent.push(JSON.parse(String(init?.body)).text);return new Response("no",{status:500})});
    await Promise.all([drainAlerts(env),drainAlerts(env)]);
    expect(sent).toHaveLength(1);expect(sent[0]).toContain("*FAIL*");
    expect(await outbox(c.id)).toHaveLength(2);
    await expireLease(c.id);sent=[];setFetchForTests((_url,init)=>{sent.push(JSON.parse(String(init?.body)).text);return new Response("ok")});
    await drainAlerts(env);await drainAlerts(env);
    expect(sent).toHaveLength(2);expect(sent[0]).toContain("*FAIL*");expect(sent[1]).toContain("*Recovered*");
  });
  it("retains pending evidence and deletes outbox on Check deletion", async () => {
    const u=await user();const c=await makeCheck(u.token,{alert_channels:[{kind:"slack",target:SLACK}]});
    const run=await insertRun(c.id,"retained-alert");
    await env.DB.batch(queueAlertStatements(env,(await getCheck(env,c.id))!,run,false));
    await env.DB.prepare("UPDATE check_runs SET timestamp=? WHERE id=?").bind(expired,run.id).run();
    for(let i=0;i<40;i++)await insertRun(c.id,`newer-${i}`);
    await retentionSweep(env,new Date());
    expect(await env.DB.prepare("SELECT id FROM check_runs WHERE id=?").bind(run.id).first()).not.toBeNull();
    expect((await api(`/checks/${c.id}`,{method:"DELETE",token:u.token})).status).toBe(200);
    expect(await outbox(c.id)).toHaveLength(0);
  });
  it("snooze pauses queued delivery and removing a channel prevents later delivery to it", async () => {
    const u=await user();const c=await makeCheck(u.token,{alert_channels:[{kind:"slack",target:SLACK}]});
    const run=await insertRun(c.id,"snoozed-alert");
    await env.DB.batch(queueAlertStatements(env,(await getCheck(env,c.id))!,run,false));
    await api(`/checks/${c.id}/snooze`,{method:"POST",token:u.token,json:{hours:1}});
    let sent=0;setFetchForTests(()=>{sent++;return new Response("ok")});await drainAlerts(env);expect(sent).toBe(0);
    await api(`/checks/${c.id}/snooze`,{method:"DELETE",token:u.token});
    await api(`/checks/${c.id}/channels/${c.alert_channels[0].id}`,{method:"DELETE",token:u.token});
    await expireLease(c.id);await drainAlerts(env);expect(sent).toBe(0);expect(await outbox(c.id)).toHaveLength(0);
  });
});

describe("durable manual execution", () => {
  it("persists before acknowledging and survives an abandoned background lease", async () => {
    const u=await user();const c=await makeCheck(u.token,{expectations:{min_new_records:0}});
    // An abandoned invocation holds the queue lease; eager processing cannot run.
    await env.DB.prepare("UPDATE checks SET run_lease_token='abandoned',run_lease_until=? WHERE id=?").bind(new Date(Date.now()+120000).toISOString(),c.id).run();
    const work:Promise<unknown>[]=[];
    const ctx={waitUntil:(p:Promise<unknown>)=>work.push(p)} as unknown as ExecutionContext;
    const r=await runNow(env,new Request(`http://api.test/api/checks/${c.id}/run`,{method:"POST",headers:{authorization:`Bearer ${u.token}`}}),ctx,c.id);
    const data=await r.json() as any;await Promise.all(work);
    expect((await getCheck(env,c.id))!.pending_runs[0]).toMatchObject({run_id:data.run_id,trigger:"manual"});
    await env.DB.prepare("UPDATE checks SET run_lease_until=? WHERE id=?").bind(expired,c.id).run();
    let reads=0;setFetchForTests(()=>{reads++;return jsonResponse([])});
    await Promise.all([drainPendingRuns(env),drainPendingRuns(env)]);
    expect(reads).toBe(1);
    expect(await env.DB.prepare("SELECT trigger FROM check_runs WHERE id=?").bind(data.run_id).first()).toEqual({trigger:"manual"});
    expect((await getCheck(env,c.id))!.pending_runs).toHaveLength(0);
  });
  it("reconciles an already recorded manual job without another destination read", async () => {
    const u=await user();const c=await makeCheck(u.token);await insertRun(c.id,"recorded-manual");
    await enqueueRun(env,c.id,{run_id:"recorded-manual",trigger:"manual",claimed_new:null,body_note:null,queued_at:new Date().toISOString()});
    let reads=0;setFetchForTests(()=>{reads++;return jsonResponse([])});
    await drainPendingRuns(env);expect(reads).toBe(0);expect((await getCheck(env,c.id))!.pending_runs).toHaveLength(0);
  });
});
