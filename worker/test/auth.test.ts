import { describe, expect, it } from "vitest";
import { api, user } from "./helpers";

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
