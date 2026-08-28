import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { deliver, formatAlert } from "../src/alerts";
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

describe("formatAlert", () => {
  const ev = { state: "FAIL" as const, name: "Orders sync", message: "Run reported success, but the destination gained 0.", timestamp: "2026-08-28T21:13:56.996Z", link: "https://verifyruns.pages.dev/checks/abc" };
  it("slack keeps its markup and named link", () => {
    const t = formatAlert("slack", ev);
    expect(t).toContain(":rotating_light: *FAIL* — Orders sync");
    expect(t).toContain("<https://verifyruns.pages.dev/checks/abc|Open in VerifyRuns>");
  });
  it("discord gets bold, no slack shortcodes", () => {
    const t = formatAlert("discord", ev);
    expect(t).toContain("**FAIL** — Orders sync");
    expect(t).not.toContain(":rotating_light:");
    expect(t).toContain("https://verifyruns.pages.dev/checks/abc");
  });
  it("email is plain text: no shortcodes, no asterisks or underscores, a readable time and the link on its own line", () => {
    const t = formatAlert("email", { ...ev, state: "Recovered" });
    expect(t).not.toMatch(/:[a-z_]+:|\*|_At/);
    expect(t.split("\n")[0]).toBe("Recovered — Orders sync");
    expect(t).toContain("Run reported success, but the destination gained 0.");
    expect(t).toContain("At 2026-08-28 21:13 UTC");
    expect(t.split("\n").pop()).toBe("Open in VerifyRuns: https://verifyruns.pages.dev/checks/abc");
  });
});
