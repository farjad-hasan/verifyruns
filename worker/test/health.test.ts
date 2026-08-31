import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { api } from "./helpers";

const stamp = (iso: string) => env.DB.prepare("UPDATE meta SET value = ? WHERE key = 'tick_last_at'").bind(iso).run();
const stampOk = (iso: string) =>
  env.DB.prepare("INSERT INTO meta (key, value) VALUES ('tick_last_ok_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(iso).run();
const setFailures = (n: number) =>
  env.DB.prepare("INSERT INTO meta (key, value) VALUES ('alert_delivery_failures', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(n)).run();

describe("GET /api/health", () => {
  it("200 keyed off the completion stamp; carries both ages and the failure counter", async () => {
    await stamp(new Date(Date.now() - 30_000).toISOString());
    await stampOk(new Date(Date.now() - 30_000).toISOString());
    await setFailures(7);
    const r = await api("/health");
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.tick_ok_age_seconds).toBeGreaterThanOrEqual(29);
    expect(r.data.tick_ok_age_seconds).toBeLessThan(60);
    expect(r.data.tick_age_seconds).toBeGreaterThanOrEqual(29); // the old field survives for existing probes
    expect(r.data.alert_delivery_failures).toBe(7); // reported without flipping ok
    expect(typeof r.data.checked_at).toBe("string");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("503 when only the start stamp is fresh: a tick that starts and throws must not keep the probe green", async () => {
    await stamp(new Date(Date.now() - 10_000).toISOString()); // starts keep happening…
    await stampOk(new Date(Date.now() - 15 * 60_000).toISOString()); // …but nothing completes
    const r = await api("/health");
    expect(r.status).toBe(503);
    expect(r.data.ok).toBe(false);
    expect(r.data.tick_ok_age_seconds).toBeGreaterThanOrEqual(15 * 60 - 1);
  });
  it("503 when no completed tick was ever recorded", async () => {
    await stamp(new Date().toISOString());
    await env.DB.prepare("DELETE FROM meta WHERE key = 'tick_last_ok_at'").run();
    const r = await api("/health");
    expect(r.status).toBe(503);
    expect(r.data.tick_ok_age_seconds).toBeNull();
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
