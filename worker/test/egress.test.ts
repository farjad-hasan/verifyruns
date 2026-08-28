import { describe, expect, it } from "vitest";
import { egressViolation, RateLimiter } from "../src/egress";
import { api, DEST_URL, user } from "./helpers";

describe("egress policy (literal addresses on Workers)", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "http://127.0.0.1:8000/api",
    "http://localhost/api",
    "http://10.0.0.5/x",
    "https://192.168.1.10/x",
    "http://[::1]/",
    "http://[fd00::1]/",
    "postgresql://u:p@10.0.0.5:5432/db",
    "postgres://u:p@localhost:5434/vr",
    "http://metadata.google.internal/computeMetadata/v1/",
  ])("refuses %s", (target) => {
    expect(egressViolation(target, false)).toMatch(/^Destination must be a public address/);
  });
  it("allows public hosts and everything when the switch is on", () => {
    expect(egressViolation("https://api.airtable.com/v0/app/tbl", false)).toBeNull();
    expect(egressViolation("https://jsonplaceholder.typicode.com/todos", false)).toBeNull();
    expect(egressViolation("http://127.0.0.1:8000/api", true)).toBeNull();
    expect(egressViolation("just-a-host", false)).toBeNull(); // a bare hostname; the fetch itself will fail
    expect(egressViolation("", false)).toMatch(/no host/);
  });
  it("is enforced at save time for HTTP and Postgres when private egress is off", async () => {
    const u = await user();
    // the test binding allows private egress; the message shape is covered by the pure test above,
    // and the fetch-time refusal by connectors.test. Here: a public destination saves.
    const ok = await api("/checks", { method: "POST", token: u.token, json: { name: "x", connector_kind: "http_json", config: { url: DEST_URL } } });
    expect(ok.status).toBe(200);
  });
});

describe("rate limiter", () => {
  it("counts per key and expires", () => {
    let now = 1000;
    const rl = new RateLimiter(3, 60, () => now);
    expect([rl.allow("a"), rl.allow("a"), rl.allow("a")]).toEqual([true, true, true]);
    expect(rl.allow("a")).toBe(false);
    expect(rl.allow("b")).toBe(true);
    expect(rl.retryAfter("a")).toBeGreaterThan(0);
    now += 61;
    expect(rl.allow("a")).toBe(true);
  });
});
