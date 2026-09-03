import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, DEST_URL, makeCheck, user } from "./helpers";

const storedUrl = async (id: string) => JSON.parse((await env.DB.prepare("SELECT config FROM checks WHERE id = ?").bind(id).first<any>()).config).url;

describe("checks CRUD (parity with backend_test.py + test_egress/test_heartbeat validation)", () => {
  it("creates an HTTP/JSON check and masks the bearer token", async () => {
    const u = await user();
    const r = await api("/checks", {
      method: "POST",
      token: u.token,
      json: { name: "orders", connector_kind: "http_json", config: { url: DEST_URL, bearer_token: "sk_live_abcd1234", json_path: "data" } },
    });
    expect(r.status).toBe(200);
    expect(r.data.config.has_bearer_token).toBe(true);
    expect(r.data.config.bearer_token_last4).toBe("••••••••1234");
    expect(r.data.config.bearer_token).toBeUndefined();
    expect(r.data.config.bearer_token_encrypted).toBeUndefined();
    expect(r.data.config.json_path).toBe("data");
    expect(typeof r.data.webhook_secret).toBe("string");
    expect(r.data.expectations).toEqual({ min_new_records: 1, required_fields: [], non_empty_fields: [], growth_mode: "growth" });
    expect(r.data.retry_before_alert).toBe(true);
    expect(r.data.heartbeat_hours).toBeNull();
    expect(r.data.store_samples).toBe(false);
    expect(r.data.alert_channels).toEqual([]);
    expect(r.data.is_public).toBe(false);
    expect(r.data.is_snoozed).toBe(false);
    expect(r.data.pending_retry_at).toBeNull();
    expect(r.data.pending_runs).toBe(0);
  });

  it("validates connector config with 400s naming the field", async () => {
    const u = await user();
    const a = await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "airtable", config: { table: "t" } } });
    expect(a.status).toBe(400);
    expect(a.data.detail).toBe("config.base_id is required for airtable");
    const p = await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "postgres", config: { dsn: "postgres://u:p@db.example.com/x" } } });
    expect(p.status).toBe(400);
    expect(p.data.detail).toBe("config.query is required for postgres");
    const w = await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "postgres", config: { dsn: "postgres://u:p@db.example.com/x", query: "DELETE FROM t" } } });
    expect(w.status).toBe(400);
    expect(w.data.detail).toBe("postgres query must start with SELECT or WITH");
    const unk = await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "ftp", config: {} } });
    expect(unk.status).toBe(400);
  });

  it("validates heartbeat_hours (1–720) and expectations", async () => {
    const u = await user();
    expect((await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "http_json", config: { url: DEST_URL }, heartbeat_hours: 0 } })).status).toBe(422);
    expect((await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "http_json", config: { url: DEST_URL }, heartbeat_hours: 1000 } })).status).toBe(422);
    const ok = await makeCheck(u.token, { heartbeat_hours: 24, expectations: { min_new_records: 0, growth_mode: "steady" } });
    expect(ok.heartbeat_hours).toBe(24);
    expect(ok.expectations.growth_mode).toBe("steady");
    expect(ok.expectations.min_new_records).toBe(0);
    expect((await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "http_json", config: { url: DEST_URL }, expectations: { growth_mode: "wild" } } })).status).toBe(422);
  });

  it("lists own checks without webhook_secret and with recent_runs; detail includes the secret", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    const list = await api("/checks", { token: u.token });
    expect(list.status).toBe(200);
    expect(list.data.length).toBe(1);
    expect(list.data[0].webhook_secret).toBeUndefined();
    expect(list.data[0].recent_runs).toEqual([]);
    expect(list.data[0].last_verdict).toBeNull();
    const one = await api(`/checks/${c.id}`, { token: u.token });
    expect(one.data.webhook_secret).toBe(c.webhook_secret);
  });

  it("isolates users", async () => {
    const a = await user("a");
    const b = await user("b");
    const c = await makeCheck(a.token);
    expect((await api(`/checks/${c.id}`, { token: b.token })).status).toBe(404);
    expect((await api(`/checks/${c.id}`, { method: "DELETE", token: b.token })).status).toBe(404);
  });

  it("PATCH updates fields, keeps stored secrets when omitted, clears heartbeat with null", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { config: { url: DEST_URL, bearer_token: "tok_9999" }, heartbeat_hours: 12 });
    const r = await api(`/checks/${c.id}`, {
      method: "PATCH",
      token: u.token,
      json: { name: "renamed", config: { url: DEST_URL, json_path: "items" }, heartbeat_hours: null, store_samples: true, expectations: { min_new_records: 3 } },
    });
    expect(r.status).toBe(200);
    expect(r.data.name).toBe("renamed");
    expect(r.data.config.has_bearer_token).toBe(true);
    expect(r.data.config.bearer_token_last4).toBe("••••••••9999");
    expect(r.data.config.json_path).toBe("items");
    expect(r.data.heartbeat_hours).toBeNull();
    expect(r.data.store_samples).toBe(true);
    expect(r.data.expectations.min_new_records).toBe(3);
  });

  it("PATCH round-trips a stored ?apikey= URL: omitted url is preserved, a masked url is rejected and never stored", async () => {
    const u = await user();
    const raw = `${DEST_URL}?select=id&apikey=abcdefgh1234`;
    const masked = `${DEST_URL}?select=••••id&apikey=••••1234`;
    const c = await makeCheck(u.token, { config: { url: raw } });
    expect(await storedUrl(c.id)).toBe(raw);
    // No config at all.
    expect((await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { name: "renamed" } })).status).toBe(200);
    expect(await storedUrl(c.id)).toBe(raw);
    // config without url (the edit form leaving the field untouched).
    const r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { config: { json_path: "items" } } });
    expect(r.status).toBe(200);
    expect(r.data.config.json_path).toBe("items");
    expect(r.data.config.url).toBe(masked);
    expect(await storedUrl(c.id)).toBe(raw);
    // The sanitised value sent back must never be stored.
    const bad = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { config: { url: masked, json_path: "x" } } });
    expect(bad.status).toBe(422);
    expect(bad.data.detail[0].loc).toEqual(["body", "config", "url"]);
    expect(await storedUrl(c.id)).toBe(raw);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.config.json_path).toBe("items");
    // Create-time: url still required, masked still rejected.
    const create = await api("/checks", { method: "POST", token: u.token, json: { name: "n", connector_kind: "http_json", config: { url: masked } } });
    expect(create.status).toBe(422);
  });

  it("deletes a check and its runs", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    expect((await api(`/checks/${c.id}`, { method: "DELETE", token: u.token })).data).toEqual({ ok: true });
    expect((await api(`/checks/${c.id}`, { token: u.token })).status).toBe(404);
  });

  it("snooze / wake", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    const s = await api(`/checks/${c.id}/snooze`, { method: "POST", token: u.token, json: { hours: 2 } });
    expect(s.status).toBe(200);
    expect(s.data.is_snoozed).toBe(true);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.is_snoozed).toBe(true);
    expect((await api(`/checks/${c.id}/snooze`, { method: "POST", token: u.token, json: { hours: 999 } })).status).toBe(422);
    const w = await api(`/checks/${c.id}/snooze`, { method: "DELETE", token: u.token });
    expect(w.data).toEqual({ is_snoozed: false });
  });

  it("public status token enable/disable and the public endpoint shape", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    const on = await api(`/checks/${c.id}/public`, { method: "POST", token: u.token });
    expect(on.data.is_public).toBe(true);
    const again = await api(`/checks/${c.id}/public`, { method: "POST", token: u.token });
    expect(again.data.public_token).toBe(on.data.public_token);
    const pub = await api(`/public/checks/${on.data.public_token}`);
    expect(pub.status).toBe(200);
    expect(pub.data).toEqual({ name: "t", connector_kind: "http_json", last_verdict: null, checked_at: null, heartbeat_hours: null, runs: [] });
    expect((await api(`/checks/${c.id}/public`, { method: "DELETE", token: u.token })).data).toEqual({ is_public: false });
    expect((await api(`/public/checks/${on.data.public_token}`)).status).toBe(404);
  });

  it("alert channels: add/list/delete, legacy slack, email gated", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { alert_slack_webhook: "https://hooks.slack.com/services/T/B/wxyz" });
    expect(c.alert_channels).toEqual([{ id: "legacy-slack", kind: "slack", last4: "••••••••wxyz" }]);
    const d = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "discord", target: "https://discord.com/api/webhooks/1/abcd" } });
    expect(d.status).toBe(200);
    expect(d.data.kind).toBe("discord");
    expect(d.data.last4).toBe("••••••••abcd");
    expect(d.data.target).toBeUndefined();
    const e = await api(`/checks/${c.id}/channels`, { method: "POST", token: u.token, json: { kind: "email", target: "ops@example.com" } });
    expect(e.status).toBe(400);
    expect(e.data.detail).toBe("Email alerts are not configured on this host (set RESEND_API_KEY and ALERT_FROM).");
    const listed = (await api(`/checks/${c.id}`, { token: u.token })).data.alert_channels;
    expect(listed.map((x: any) => x.kind)).toEqual(["slack", "discord"]);
    expect((await api(`/checks/${c.id}/channels/legacy-slack`, { method: "DELETE", token: u.token })).status).toBe(200);
    expect((await api(`/checks/${c.id}/channels/${d.data.id}`, { method: "DELETE", token: u.token })).status).toBe(200);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.alert_channels).toEqual([]);
    expect((await api(`/meta`)).data).toEqual({ email_alerts: false });
  });

  it("plans are public; interest needs login and a known plan", async () => {
    const plans = await api("/plans");
    expect(plans.data.early_access).toBe(true);
    expect(plans.data.plans.map((p: any) => p.id)).toEqual(["free", "pro", "agency"]);
    expect((await api("/interest", { method: "POST", json: { plan: "pro" } })).status).toBe(401);
    const u = await user();
    expect((await api("/interest", { method: "POST", token: u.token, json: { plan: "enterprise" } })).status).toBe(422);
    const r = await api("/interest", { method: "POST", token: u.token, json: { plan: "pro", note: "need Postgres" } });
    expect(r.data).toEqual({ ok: true, plan: "pro" });
  });
});

describe("heartbeat_window (heartbeat-schedule-window)", () => {
  const W = { start: "13:00", end: "23:00", tz: "Asia/Karachi" };
  const create = (token: string, extra: Record<string, unknown>) =>
    api("/checks", { method: "POST", token, json: { name: "x", connector_kind: "http_json", config: { url: DEST_URL }, ...extra } });

  it("round-trips on create, detail and list; null by default", async () => {
    const u = await user();
    const plain = await makeCheck(u.token, { heartbeat_hours: 2 });
    expect(plain.heartbeat_window).toBeNull();
    const c = await makeCheck(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, days: [1, 2, 3, 4, 5] } });
    expect(c.heartbeat_window).toEqual({ ...W, days: [1, 2, 3, 4, 5] });
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.heartbeat_window).toEqual({ ...W, days: [1, 2, 3, 4, 5] });
    const listed = (await api("/checks", { token: u.token })).data.find((x: any) => x.id === c.id);
    expect(listed.heartbeat_window).toEqual({ ...W, days: [1, 2, 3, 4, 5] });
  });

  it("window without cadence is refused naming heartbeat_hours", async () => {
    const u = await user();
    const r = await create(u.token, { heartbeat_window: W });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.data)).toContain("heartbeat_hours");
  });

  it("bad tz, bad times and bad days are refused naming the field", async () => {
    const u = await user();
    const tz = await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, tz: "Mars/Olympus" } });
    expect(tz.status).toBe(422);
    expect(JSON.stringify(tz.data)).toContain("heartbeat_window");
    expect(JSON.stringify(tz.data)).toContain("tz");
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, start: "25:00" } })).status).toBe(422);
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, end: "9am" } })).status).toBe(422);
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, days: [] } })).status).toBe(422);
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, days: [1, 7] } })).status).toBe(422);
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: { ...W, days: [1, 1] } })).status).toBe(422);
    expect((await create(u.token, { heartbeat_hours: 1, heartbeat_window: "13-23" })).status).toBe(422);
  });

  it("PATCH sets, changes and clears the window; clearing the cadence clears the window and the due time", async () => {
    const u = await user();
    const c = await makeCheck(u.token, { heartbeat_hours: 1 });
    let r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_window: W } });
    expect(r.status).toBe(200);
    expect(r.data.heartbeat_window).toEqual(W);
    // due time now respects the window: created just now (outside or inside 13–23 PKT), never null
    let row = await env.DB.prepare("SELECT next_heartbeat_due_at AS d FROM checks WHERE id = ?").bind(c.id).first<{ d: string }>();
    expect(row!.d).toBeTruthy();
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_window: null } });
    expect(r.data.heartbeat_window).toBeNull();
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_window: W } });
    expect(r.data.heartbeat_window).toEqual(W);
    // window on its own when the Check has no cadence → 422
    const noHb = await makeCheck(u.token, {});
    expect((await api(`/checks/${noHb.id}`, { method: "PATCH", token: u.token, json: { heartbeat_window: W } })).status).toBe(422);
    // clearing the cadence clears the window
    r = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { heartbeat_hours: null } });
    expect(r.data.heartbeat_hours).toBeNull();
    expect(r.data.heartbeat_window).toBeNull();
    row = await env.DB.prepare("SELECT next_heartbeat_due_at AS d FROM checks WHERE id = ?").bind(c.id).first<{ d: string }>();
    expect(row!.d).toBeNull();
  });

  it("migration 0005: checks carry heartbeat_window, null by default", async () => {
    const cols = (await env.DB.prepare("PRAGMA table_info(checks)").all<{ name: string; dflt_value: string | null }>()).results;
    const col = cols.find((c) => c.name === "heartbeat_window");
    expect(col).toBeTruthy();
    expect(col!.dflt_value).toBeNull();
  });
});
