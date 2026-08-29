import { afterEach, describe, expect, it } from "vitest";
import { setFetchForTests } from "../src/net";
import { api, jsonResponse, makeCheck, user } from "./helpers";

afterEach(() => setFetchForTests(null));

const todos = (n = 200) => Array.from({ length: n }, (_, i) => ({ userId: 1, id: i + 1, title: `t${i}`, completed: false }));
const WEBHOOK = "https://discord.com/api/webhooks/1/abcdSECRET";
const SECRET_QUERY = "apikey=abcdefgh1234";

describe("public status endpoint (verdicts only, for teammates without an account)", () => {
  it("adds checked_at, heartbeat_hours and per-run alerts_sent reduced to {kind, ok}", async () => {
    // Discord fails, Slack succeeds (any other fetch is the destination), so the stored row has one error to strip.
    setFetchForTests(async (url) => (url.startsWith("https://discord") ? new Response("boom", { status: 500 }) : jsonResponse(todos())));
    const u = await user();
    const c = await makeCheck(u.token, {
      config: { url: `https://jsonplaceholder.typicode.com/todos?${SECRET_QUERY}`, bearer_token: "sk_live_bearerSECRET" },
      expectations: { min_new_records: 1 },
      retry_before_alert: false,
      heartbeat_hours: 28,
      alert_channels: [{ kind: "discord", target: WEBHOOK }, { kind: "slack", target: "https://hooks.slack.com/services/T/B/slackSECRET" }],
    });
    expect((await api(`/hook/${c.webhook_secret}`, { method: "POST" })).data.verdict).toBe("PASS");
    const fail = await api(`/hook/${c.webhook_secret}`, { method: "POST" });
    expect(fail.data.verdict).toBe("FAIL");
    // The owner sees the delivery error; the public page must not.
    const own = (await api(`/runs/${fail.data.run_id}`, { token: u.token })).data;
    expect(own.alerts_sent).toEqual([
      { kind: "discord", ok: false, error: expect.stringContaining("500") },
      { kind: "slack", ok: true },
    ]);

    const on = await api(`/checks/${c.id}/public`, { method: "POST", token: u.token });
    const pub = await api(`/public/checks/${on.data.public_token}`);
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.data).sort()).toEqual(["checked_at", "connector_kind", "heartbeat_hours", "last_verdict", "name", "runs"]);
    expect(pub.data.last_verdict).toBe("FAIL");
    expect(pub.data.heartbeat_hours).toBe(28);
    expect(pub.data.runs.length).toBe(2);
    expect(pub.data.runs[0].id).toBe(fail.data.run_id); // newest first
    expect(pub.data.checked_at).toBe(own.timestamp);
    expect(pub.data.runs[0].timestamp).toBe(own.timestamp);
    for (const run of pub.data.runs) expect(Object.keys(run).sort()).toEqual(["alerts_sent", "diff_message", "id", "timestamp", "trigger", "verdict"]);
    expect(pub.data.runs[0].alerts_sent).toEqual([
      { kind: "discord", ok: false },
      { kind: "slack", ok: true },
    ]);
    expect(pub.data.runs[1].alerts_sent).toEqual([]);

    const body = JSON.stringify(pub.data);
    for (const leak of [WEBHOOK, "hooks.slack.com", "SECRET", "abcdefgh1234", SECRET_QUERY, "boom", "@example.com", u.email, c.webhook_secret]) expect(body).not.toContain(leak);
    for (const key of ["target", "error", "error_details", "config", "fingerprint", "webhook_secret", "bearer", "url", "user_id", "public_token", "id\":\"" + c.id]) expect(body).not.toContain(`"${key}`);
  });

  it("returns null checked_at and heartbeat_hours when there are no runs and no heartbeat", async () => {
    const u = await user();
    const c = await makeCheck(u.token);
    const on = await api(`/checks/${c.id}/public`, { method: "POST", token: u.token });
    const pub = await api(`/public/checks/${on.data.public_token}`);
    expect(pub.data).toEqual({ name: "t", connector_kind: "http_json", last_verdict: null, checked_at: null, heartbeat_hours: null, runs: [] });
  });
});
