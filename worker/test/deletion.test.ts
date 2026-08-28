import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api, user } from "./helpers";

describe("DELETE /auth/me leaves nothing behind", () => {
  it("removes the user's pricing-interest rows too", async () => {
    const u = await user();
    expect((await api("/interest", { method: "POST", token: u.token, json: { plan: "pro", note: "would pay" } })).status).toBe(200);
    expect((await api("/auth/me", { method: "DELETE", token: u.token })).status).toBe(200);
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM interest WHERE user_id = ? OR email = ?").bind(u.id, u.email).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
