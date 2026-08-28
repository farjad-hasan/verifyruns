import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { deliver } from "../src/alerts";
import { setFetchForTests } from "../src/net";

afterEach(() => setFetchForTests(null));

describe("deliver", () => {
  it("returns the provider's status and body when delivery is refused, so the run can show why", async () => {
    setFetchForTests(async () => new Response(JSON.stringify({ statusCode: 422, name: "validation_error", message: "The from field is invalid" }), { status: 422 }));
    const r = await deliver({ ...env, RESEND_API_KEY: "re_test", ALERT_FROM: "bad-from" } as any, "email", "a@b.co", "text", "subject");
    expect(r.ok).toBe(false);
    expect((r as any).error).toBe('422 {"statusCode":422,"name":"validation_error","message":"The from field is invalid"}');
  });
  it("reports success plainly", async () => {
    setFetchForTests(async () => new Response("{}", { status: 200 }));
    const r = await deliver(env as any, "slack", "https://hooks.slack.com/x", "text");
    expect(r).toEqual({ ok: true });
  });
  it("names a missing email configuration instead of failing silently", async () => {
    const r = await deliver({ ...env, RESEND_API_KEY: "", ALERT_FROM: "" } as any, "email", "a@b.co", "text", "s");
    expect(r.ok).toBe(false);
    expect((r as any).error).toMatch(/RESEND_API_KEY/);
  });
});
