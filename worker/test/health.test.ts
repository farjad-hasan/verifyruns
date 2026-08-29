import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api } from "./helpers";

const stamp = (iso: string) => env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(iso).run();

describe("GET /api/health", () => {
  it("200 with the tick age when the tick is fresh", async () => {
    await stamp(new Date(Date.now() - 30_000).toISOString());
    const r = await api("/health");
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.tick_age_seconds).toBeGreaterThanOrEqual(29);
    expect(r.data.tick_age_seconds).toBeLessThan(60);
    expect(typeof r.data.checked_at).toBe("string");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("503 when the tick is older than the allowed age, measured before this request's own lazy tick", async () => {
    await stamp(new Date(Date.now() - 15 * 60_000).toISOString());
    const r = await api("/health");
    expect(r.status).toBe(503);
    expect(r.data.ok).toBe(false);
    expect(r.data.tick_age_seconds).toBeGreaterThanOrEqual(15 * 60 - 1);
  });
});

describe("security headers", () => {
  it("every API response carries HSTS, nosniff, referrer policy and no-store", async () => {
    for (const r of [await api(""), await api("/nope")]) {
      expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("referrer-policy")).toBe("no-referrer");
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
});
