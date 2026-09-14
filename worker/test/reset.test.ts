import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, user } from "./helpers";
import { setFetchForTests } from "../src/net";
import { forgot, RESET_TTL_MS } from "../src/reset";
import { sha256Hex } from "../src/crypto";
import { tick } from "../src/tick";

afterEach(() => setFetchForTests(null));

const mailEnv = () => ({ ...env, RESEND_API_KEY: "re_test", ALERT_FROM: "VerifyRuns <x@example.com>", PUBLIC_APP_URL: "https://app.test/", VR_PASSWORD_RESET: "1" }) as any;
const post = (body: unknown) => new Request("http://api.test/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Run /forgot for `email` on a mail-enabled host; returns the token from the sent link and the captured Resend payloads. */
async function requestReset(email: string) {
  const sent: any[] = [];
  setFetchForTests(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  });
  const res = await forgot(mailEnv(), post({ email }));
  const m = sent[0]?.text?.match(/\/reset\?token=([A-Za-z0-9_-]+)/);
  return { status: res.status, data: await res.json(), sent, token: m?.[1] as string | undefined };
}

describe("POST /auth/forgot", () => {
  it("stays unavailable by default even when Resend secrets exist", async () => {
    setFetchForTests(async () => new Response("{}", { status: 200 }));
    const prevKey = (env as any).RESEND_API_KEY;
    const prevFrom = (env as any).ALERT_FROM;
    const prevReset = (env as any).VR_PASSWORD_RESET;
    try {
      (env as any).RESEND_API_KEY = "re_test";
      (env as any).ALERT_FROM = "VerifyRuns <x@example.com>";
      delete (env as any).VR_PASSWORD_RESET;
      const r = await api("/auth/forgot", { method: "POST", json: { email: "a@example.com" } });
      expect(r.status).toBe(503);
      expect(r.data.detail).toMatch(/upcoming/i);
    } finally {
      if (prevKey === undefined) delete (env as any).RESEND_API_KEY; else (env as any).RESEND_API_KEY = prevKey;
      if (prevFrom === undefined) delete (env as any).ALERT_FROM; else (env as any).ALERT_FROM = prevFrom;
      if (prevReset === undefined) delete (env as any).VR_PASSWORD_RESET; else (env as any).VR_PASSWORD_RESET = prevReset;
    }
  });

  it("emails the account holder one link and stores only the token's hash", async () => {
    const u = await user("fp");
    const r = await requestReset(u.email);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ok: true });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].to).toEqual([u.email]);
    expect(r.sent[0].subject).toMatch(/reset/i);
    expect(r.token).toBeTruthy();
    const row = await env.DB.prepare("SELECT token_hash, user_id, used_at FROM password_resets WHERE user_id = ?").bind(u.id).first<any>();
    expect(row.token_hash).toBe(await sha256Hex(r.token!));
    expect(row.used_at).toBeNull();
  });

  it("answers 200 for an unknown email and sends nothing", async () => {
    const r = await requestReset(`nobody_${Date.now()}@example.com`);
    expect(r.status).toBe(200);
    expect(r.sent).toHaveLength(0);
  });

  it("says so when the host has no email configured", async () => {
    const prevReset = (env as any).VR_PASSWORD_RESET;
    const prevKey = (env as any).RESEND_API_KEY;
    const prevFrom = (env as any).ALERT_FROM;
    try {
      (env as any).VR_PASSWORD_RESET = "1";
      delete (env as any).RESEND_API_KEY;
      delete (env as any).ALERT_FROM;
      const r = await api("/auth/forgot", { method: "POST", json: { email: "a@example.com" } });
      expect(r.status).toBe(503);
      expect(r.data.detail).toBe("Password reset is not available on this host (email is not configured)");
    } finally {
      if (prevReset === undefined) delete (env as any).VR_PASSWORD_RESET; else (env as any).VR_PASSWORD_RESET = prevReset;
      if (prevKey === undefined) delete (env as any).RESEND_API_KEY; else (env as any).RESEND_API_KEY = prevKey;
      if (prevFrom === undefined) delete (env as any).ALERT_FROM; else (env as any).ALERT_FROM = prevFrom;
    }
  });
});

describe("POST /auth/reset", () => {
  it("sets the new password, logs the user in, and burns the token", async () => {
    const u = await user("rs");
    const { token } = await requestReset(u.email);
    const r = await api("/auth/reset", { method: "POST", json: { token, password: "newpass1" } });
    expect(r.status).toBe(200);
    expect(r.data.user.email).toBe(u.email);
    expect((await api("/auth/me", { token: r.data.token })).status).toBe(200);
    expect((await api("/auth/login", { method: "POST", json: { email: u.email, password: "pass123" } })).status).toBe(401);
    expect((await api("/auth/login", { method: "POST", json: { email: u.email, password: "newpass1" } })).status).toBe(200);
    const again = await api("/auth/reset", { method: "POST", json: { token, password: "another1" } });
    expect(again.status).toBe(400);
    expect(again.data.detail).toBe("Reset link is invalid or has expired");
  });

  it("refuses an expired token, a bogus token and a short password", async () => {
    const u = await user("ex");
    const { token } = await requestReset(u.email);
    await env.DB.prepare("UPDATE password_resets SET expires_at = ? WHERE user_id = ?").bind(new Date(Date.now() - 1000).toISOString(), u.id).run();
    const r = await api("/auth/reset", { method: "POST", json: { token, password: "newpass1" } });
    expect(r.status).toBe(400);
    expect((await api("/auth/reset", { method: "POST", json: { token: "nope", password: "newpass1" } })).status).toBe(400);
    const { token: t2 } = await requestReset(u.email);
    expect((await api("/auth/reset", { method: "POST", json: { token: t2, password: "12345" } })).status).toBe(422);
  });

  it("a newer request invalidates the older token", async () => {
    const u = await user("nw");
    const { token: old } = await requestReset(u.email);
    const { token: fresh } = await requestReset(u.email);
    expect((await api("/auth/reset", { method: "POST", json: { token: old, password: "newpass1" } })).status).toBe(400);
    expect((await api("/auth/reset", { method: "POST", json: { token: fresh, password: "newpass1" } })).status).toBe(200);
  });
});

describe("housekeeping", () => {
  it("the tick sweeps expired tokens and account deletion removes the user's", async () => {
    const u = await user("hk");
    await requestReset(u.email);
    await env.DB.prepare("UPDATE password_resets SET expires_at = ? WHERE user_id = ?").bind(new Date(Date.now() - RESET_TTL_MS).toISOString(), u.id).run();
    await tick(env as any);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?").bind(u.id).first<any>()).n).toBe(0);
    await requestReset(u.email);
    expect((await api("/auth/me", { method: "DELETE", token: u.token })).status).toBe(200);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ?").bind(u.id).first<any>()).n).toBe(0);
  });
});
