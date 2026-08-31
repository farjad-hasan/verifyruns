import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { hashPassword, pbkdf2Calls, signJwt } from "../src/crypto";
import { clientIp } from "../src/http";
import { api, user } from "./helpers";

describe("client IP trust", () => {
  const req = (headers: Record<string, string>) => new Request("http://api.test/api/auth/login", { headers });
  it("buckets by CF-Connecting-IP only; spoofed X-Forwarded-For variants are never consulted", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "8.8.8.8, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": `spoof-${Math.random()}` }))).toBe("203.0.113.9");
  });
  it("no trusted header → the shared fallback bucket, not a client-suppliable value", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("sessions die on password reset", () => {
  const mailEnv = () => ({ ...env, RESEND_API_KEY: "re_test", ALERT_FROM: "VerifyRuns <x@example.com>", PUBLIC_APP_URL: "https://app.test/" }) as any;
  async function resetVia(email: string) {
    const { setFetchForTests } = await import("../src/net");
    const { forgot } = await import("../src/reset");
    const sent: any[] = [];
    setFetchForTests(async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    });
    await forgot(mailEnv(), new Request("http://api.test/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }));
    setFetchForTests(null);
    return sent[0]?.text?.match(/\/reset\?token=([A-Za-z0-9_-]+)/)?.[1] as string;
  }

  it("a pre-reset token stops authenticating; the reset's own token keeps working", async () => {
    const u = await user("tv");
    expect((await api("/auth/me", { token: u.token })).status).toBe(200);
    const token = await resetVia(u.email);
    const r = await api("/auth/reset", { method: "POST", json: { token, password: "newpass1" } });
    expect(r.status).toBe(200);
    expect((await api("/auth/me", { token: u.token })).status).toBe(401); // stolen/old session is dead
    expect((await api("/auth/me", { token: r.data.token })).status).toBe(200);
    const relogin = await api("/auth/login", { method: "POST", json: { email: u.email, password: "newpass1" } });
    expect((await api("/auth/me", { token: relogin.data.token })).status).toBe(200);
  });

  it("a pre-migration token without a version claim works as version 0 until a reset", async () => {
    const u = await user("tg");
    const legacy = await signJwt({ sub: u.id, email: u.email, exp: Math.floor(Date.now() / 1000) + 3600 }, "test-jwt-secret");
    expect((await api("/auth/me", { token: legacy })).status).toBe(200); // grandfathered
    const token = await resetVia(u.email);
    await api("/auth/reset", { method: "POST", json: { token, password: "newpass1" } });
    expect((await api("/auth/me", { token: legacy })).status).toBe(401);
  });
});

describe("password hashing strength", () => {
  it("an unknown email costs the same hash verification as a known one", async () => {
    await user("dm"); // ensure at least one registered user exists
    const before = pbkdf2Calls.count;
    await api("/auth/login", { method: "POST", json: { email: `ghost_${Date.now()}@example.com`, password: "whatever" } });
    expect(pbkdf2Calls.count).toBe(before + 1); // the dummy verification ran
  });

  it("a hash weaker than the current setting is upgraded on successful login", async () => {
    const u = await user("up");
    const weak = await hashPassword("pass123", 500); // test env runs at 1000
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(weak, u.id).run();
    expect((await api("/auth/login", { method: "POST", json: { email: u.email, password: "pass123" } })).status).toBe(200);
    const stored = (await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string }>())!.password_hash;
    expect(stored.split("$")[1]).toBe("1000"); // rehashed at the current strength
    expect((await api("/auth/login", { method: "POST", json: { email: u.email, password: "pass123" } })).status).toBe(200);
  });

  it("a rehash never overwrites a hash it did not verify against (concurrent reset)", async () => {
    const { maybeUpgradeHash } = await import("../src/routes");
    const u = await user("cr");
    const weak = await hashPassword("pass123", 500);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(weak, u.id).run();
    // a reset lands between this login's verification and its upgrade write
    const resetHash = await hashPassword("resetpass", 1000);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(resetHash, u.id).run();
    await maybeUpgradeHash(env as any, u.id, weak, "pass123", 1000); // still holds the pre-reset hash it verified
    const stored = (await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string }>())!.password_hash;
    expect(stored).toBe(resetHash); // the reset's hash stands; the old password was not re-installed
  });

  it("migration 0004: users carry token_version, default 0", async () => {
    const u = await user("mg");
    const row = await env.DB.prepare("SELECT token_version FROM users WHERE id = ?").bind(u.id).first<{ token_version: number }>();
    expect(row!.token_version).toBe(0);
  });
});

describe("auth (parity with backend/tests/backend_test.py)", () => {
  it("registers, normalises email, returns a token", async () => {
    const email = `Mixed_${Date.now()}@Example.COM`;
    const r = await api("/auth/register", { method: "POST", json: { email, password: "pass123" } });
    expect(r.status).toBe(200);
    expect(r.data.user.email).toBe(email.toLowerCase());
    expect(typeof r.data.token).toBe("string");
  });

  it("rejects duplicate email with 400", async () => {
    const u = await user();
    const r = await api("/auth/register", { method: "POST", json: { email: u.email, password: "pass123" } });
    expect(r.status).toBe(400);
    expect(r.data.detail).toBe("Email already registered");
  });

  it("rejects short passwords with 422", async () => {
    const r = await api("/auth/register", { method: "POST", json: { email: `s_${Date.now()}@example.com`, password: "12345" } });
    expect(r.status).toBe(422);
  });

  it("logs in and refuses wrong password / unknown user", async () => {
    const u = await user();
    const ok = await api("/auth/login", { method: "POST", json: { email: u.email, password: "pass123" } });
    expect(ok.status).toBe(200);
    expect(ok.data.token).toBeTruthy();
    const bad = await api("/auth/login", { method: "POST", json: { email: u.email, password: "wrong" } });
    expect(bad.status).toBe(401);
    expect(bad.data.detail).toBe("Invalid email or password");
    const none = await api("/auth/login", { method: "POST", json: { email: "nobody@example.com", password: "x" } });
    expect(none.status).toBe(401);
  });

  it("/auth/me returns the user without password_hash; 401 without a token", async () => {
    const u = await user();
    const me = await api("/auth/me", { token: u.token });
    expect(me.status).toBe(200);
    expect(me.data.email).toBe(u.email);
    expect(me.data.password_hash).toBeUndefined();
    expect((await api("/auth/me")).status).toBe(401);
    expect((await api("/auth/me", { token: "garbage" })).status).toBe(401);
  });

  it("DELETE /auth/me removes the account", async () => {
    const u = await user();
    expect((await api("/auth/me", { method: "DELETE", token: u.token })).status).toBe(200);
    expect((await api("/auth/me", { token: u.token })).status).toBe(401);
  });

  it("GET /api/ is the health check", async () => {
    const r = await api("/");
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ app: "VerifyRuns", ok: true });
  });
});
