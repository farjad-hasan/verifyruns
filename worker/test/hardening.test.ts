import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { HttpError } from "../src/http";
import * as r from "../src/routes";
import { api, DEST_URL, makeCheck, user } from "./helpers";

const META = "http://169.254.169.254/hook";
const SLACK = "https://hooks.slack.com/services/T/B/abcd";

describe("PATCH connector_kind", () => {
  it("unknown kind → 400; kind change without config → 400 and unchanged; with config → stored", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    let r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { connector_kind: "bogus" } });
    expect(r.status).toBe(400);
    expect(r.data.detail).toBe("Unknown connector kind: bogus");
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { connector_kind: "airtable" } });
    expect(r.status).toBe(400);
    expect(r.data.detail).toBe("config is required when changing connector_kind");
    const row = await env.DB.prepare("SELECT connector_kind FROM checks WHERE id = ?").bind(c.id).first<any>();
    expect(row.connector_kind).toBe("http_json");
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { connector_kind: "airtable", config: { base_id: "appX", table: "T", personal_access_token: "pat_secret" } } });
    expect(r.status).toBe(200);
    expect(r.data.connector_kind).toBe("airtable");
    expect(r.data.config.base_id).toBe("appX");
    expect(r.data.config.has_pat).toBe(true);
    // same kind restated without config is still fine
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { connector_kind: "airtable", name: "n2" } });
    expect(r.status).toBe(200);
  });
});

describe("alert target validation", () => {
  it("refuses a metadata-address webhook on create (channels + legacy), on add, and on PATCH legacy", async () => {
    const strict = { ...env, VR_ALLOW_PRIVATE_EGRESS: "0" } as any;
    const u = await user();
    const post = (path: string, body: unknown, method = "POST") => new Request(`http://api.test/api${path}`, { method, headers: { authorization: `Bearer ${u.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const errOf = async (p: Promise<Response>) => { try { await p; return null; } catch (e: any) { return e as HttpError; } };
    let e = await errOf(r.createCheck(strict, post("/checks", { name: "n", connector_kind: "http_json", config: { url: DEST_URL }, alert_channels: [{ kind: "slack", target: META }] })));
    expect(e?.status).toBe(422);
    expect((e!.detail as any)[0].loc).toEqual(["body", "alert_channels", 0, "target"]);
    e = await errOf(r.createCheck(strict, post("/checks", { name: "n", connector_kind: "http_json", config: { url: DEST_URL }, alert_slack_webhook: META })));
    expect(e?.status).toBe(422);
    expect((e!.detail as any)[0].loc).toEqual(["body", "alert_slack_webhook"]);
    const c = await makeCheck(u.token);
    e = await errOf(r.addChannel(strict, post(`/checks/${c.id}/channels`, { kind: "discord", target: "http://10.0.0.5/x" }), c.id));
    expect(e?.status).toBe(422);
    expect((e!.detail as any)[0].loc).toEqual(["body", "target"]);
    expect((e!.detail as any)[0].msg).toMatch(/public address/);
    e = await errOf(r.patchCheck(strict, post(`/checks/${c.id}`, { alert_slack_webhook: META }, "PATCH"), c.id));
    expect(e?.status).toBe(422);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.alert_channels).toEqual([]);
  });
  it("refuses non-URL webhooks and malformed emails; accepts good ones", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    let r = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "slack", target: "not a url" } });
    expect(r.status).toBe(422);
    expect(r.data.detail[0].msg).toBe("target must be an http(s) URL");
    r = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "slack", target: "ftp://hooks.slack.com/x" } });
    expect(r.status).toBe(422);
    r = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "email", target: "nobody" } });
    expect(r.status).toBe(422);
    expect(r.data.detail[0].msg).toBe("target must be an email address");
    r = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "slack", target: SLACK } });
    expect(r.status).toBe(200);
    expect(r.data.last4).toBe("••••••••abcd");
  });
});
