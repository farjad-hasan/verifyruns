import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { describePgError, fetchRecords } from "../src/connectors";
import { encryptSecret } from "../src/crypto";

describe("describePgError (pure)", () => {
  it("names the no-TLS server case and the explicit cleartext opt-in", () => {
    const r = describePgError(new Error("The server does not support SSL connections"), true);
    expect(r.error).toBe("Postgres connection error: the server does not support TLS.");
    expect(r.details).toMatch(/sslmode=disable/);
  });
  it("explains a TLS handshake death as a certificate-trust problem on the hosted build", () => {
    for (const msg of ["Connection terminated unexpectedly", "internal error; reference = abc123"]) {
      const r = describePgError(new Error(msg), true);
      expect(r.error).toBe("Postgres connection error: TLS handshake failed.");
      expect(r.details).toMatch(/publicly trusted/);
      expect(r.details).toMatch(/sslmode=disable/);
      expect(r.details).toMatch(/self-host/);
    }
  });
  it("does not blame TLS when TLS is off", () => {
    const r = describePgError(new Error("Connection terminated unexpectedly"), false);
    expect(r.error).toBe("Postgres connection error: the database refused or dropped the connection.");
    expect(r.details).toMatch(/terminated/);
  });
  it("names a refused connection in workerd's own phrasing", () => {
    const r = describePgError(new Error("proxy request failed, cannot connect to the specified address"), true);
    expect(r.error).toBe("Postgres connection error: the database refused or dropped the connection.");
  });
  it("names the timeout budget when nothing answers", () => {
    const e: any = new Error("no answer from the database within 15 s");
    e.code = "TIMEOUT";
    const r = describePgError(e, true);
    expect(r.error).toBe("Postgres connection error: no answer from the database within 15 s.");
    expect(r.details).toMatch(/reachable from the public internet/);
  });
  it("carries the driver code otherwise", () => {
    const e: any = new Error("connect ECONNREFUSED 127.0.0.1:5439");
    e.code = "ECONNREFUSED";
    expect(describePgError(e, true).error).toBe("Postgres connection error: ECONNREFUSED.");
  });
});

const DSN: string = (env as any).TEST_PG_DSN || "";
let reachable = false;
beforeAll(async () => {
  if (!DSN) return;
  try {
    const { connect } = await import("cloudflare:sockets");
    const u = new URL(DSN);
    const s = connect(`${u.hostname}:${u.port || 5432}`);
    await Promise.race([s.opened, new Promise((_, rej) => setTimeout(() => rej(new Error("t")), 2000))]);
    await s.close().catch(() => {});
    reachable = true;
  } catch {
    reachable = false;
  }
});

async function pg(dsn: string, query: string) {
  return fetchRecords(env, "postgres", { dsn_encrypted: await encryptSecret(env.ENC_KEY, dsn), query });
}
const PLAIN = DSN + "?sslmode=disable";

describe("postgres connector (Docker pg on TEST_PG_DSN; skipped when unreachable)", () => {
  it("reads rows, fields and an exact count through workerd", async (ctx) => {
    if (!reachable) return ctx.skip();
    const t0 = Date.now();
    const r = await pg(PLAIN, "SELECT n AS id, 'u'||n AS email, now() - (n||' seconds')::interval AS created_at FROM generate_series(1,7) n ORDER BY created_at DESC");
    expect(r.error).toBeNull();
    expect(r.meta!.total).toBe(7);
    expect(r.records!.length).toBe(7);
    expect(Object.keys(r.records![0]).sort()).toEqual(["created_at", "email", "id"]);
    expect(typeof r.records![0].created_at).toBe("string");
    expect(r.meta!.newest_defined).toBe(true);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("reports a query error with its SQLSTATE", async (ctx) => {
    if (!reachable) return ctx.skip();
    const r = await pg(PLAIN, "SELECT nope FROM generate_series(1,2)");
    expect(r.error).toBe("Postgres query failed: PostgresError 42703.");
  });
  it("fails fast with the no-TLS message when TLS is required against a server without it", async (ctx) => {
    if (!reachable) return ctx.skip();
    const t0 = Date.now();
    const r = await pg(DSN + "?sslmode=require", "SELECT 1 AS x");
    expect(r.error).toBe("Postgres connection error: the server does not support TLS.");
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("uses TLS by default (no sslmode) and so fails the same way against a no-TLS server", async (ctx) => {
    if (!reachable) return ctx.skip();
    const r = await pg(DSN, "SELECT 1 AS x");
    expect(r.error).toBe("Postgres connection error: the server does not support TLS.");
  });
  it("fails fast on a refused port with a message that names it", async (ctx) => {
    if (!reachable) return ctx.skip();
    const t0 = Date.now();
    const r = await pg("postgres://postgres:vr@127.0.0.1:5439/vr?sslmode=disable", "SELECT 1 AS x");
    expect(r.error).toBe("Postgres connection error: the database refused or dropped the connection.");
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
