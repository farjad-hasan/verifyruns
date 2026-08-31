import { afterEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { fetchRecords } from "../src/connectors";
import { encryptSecret } from "../src/crypto";
import { setFetchForTests } from "../src/net";
import { jsonResponse } from "./helpers";

afterEach(() => setFetchForTests(null));

const enc = (s: string) => encryptSecret(env.ENC_KEY, s);

describe("http_json", () => {
  it("total is the record length; default newest is the last element", async () => {
    setFetchForTests(async () => jsonResponse({ data: [{ v: 1 }, { v: 2 }, { v: 3 }] }));
    const r = await fetchRecords(env, "http_json", { url: "https://x/api", json_path: "data" });
    expect(r.error).toBeNull();
    expect(r.meta!.total).toBe(3);
    expect(r.records![0].v).toBe(3);
    expect(r.meta!.newest_defined).toBe(true);
  });
  it("orders by newest_key desc", async () => {
    setFetchForTests(async () => jsonResponse([{ created_at: "2026-01-01", v: 1 }, { created_at: "2026-03-01", v: 3 }, { created_at: "2026-02-01", v: 2 }]));
    const r = await fetchRecords(env, "http_json", { url: "https://x/", newest_key: "created_at" });
    expect(r.records!.map((x) => x.v)).toEqual([3, 2, 1]);
  });
  it("errors: HTTP >= 400 keeps 500 chars of body; invalid JSON; path not found; bearer sent", async () => {
    let auth = "";
    setFetchForTests(async (_u, init) => {
      auth = String(new Headers(init?.headers).get("authorization"));
      return new Response("nope".repeat(200), { status: 404 });
    });
    const r = await fetchRecords(env, "http_json", { url: "https://x/", bearer_token_encrypted: await enc("tok") });
    expect(auth).toBe("Bearer tok");
    expect(r.error).toBe("Destination fetch failed with HTTP 404.");
    expect(r.details!.length).toBe(500);
    setFetchForTests(async () => new Response("<html>", { status: 200 }));
    expect((await fetchRecords(env, "http_json", { url: "https://x/" })).error).toBe("Destination did not return valid JSON.");
    setFetchForTests(async () => jsonResponse({ nope: 1 }));
    expect((await fetchRecords(env, "http_json", { url: "https://x/", json_path: "data.items" })).error).toBe("Could not find an array of records at path `data.items`.");
  });
  it("abandons oversized responses", async () => {
    setFetchForTests(async () => new Response("[" + "1,".repeat(3_000_000) + "1]", { headers: { "content-type": "application/json" } }));
    const r = await fetchRecords(env, "http_json", { url: "https://x/big" });
    expect(r.error).toBe("Destination response exceeded 5 MB.");
  });
  it("a stored credential that cannot be decrypted fails the run instead of fetching unauthenticated", async () => {
    let fetched = 0;
    setFetchForTests(async () => {
      fetched++;
      return jsonResponse([]);
    });
    const r = await fetchRecords(env, "http_json", { url: "https://x/", bearer_token_encrypted: "garbage" });
    expect(fetched).toBe(0);
    expect(r.error).toBe("Stored credential could not be read; re-enter it on the Check.");
  });
  it("refuses private literals at fetch time when not allowed", async () => {
    const r = await fetchRecords({ ...env, VR_ALLOW_PRIVATE_EGRESS: "0" }, "http_json", { url: "http://127.0.0.1:8000/x" });
    expect(r.error).toContain("Destination must be a public address (127.0.0.1 is private)");
  });
});

function airtable(total: number, newestIndex: number) {
  const calls: URL[] = [];
  const created = (i: number) => (i === newestIndex ? "2026-12-31T00:00:00.000Z" : `2026-08-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`);
  const handler = async (url: string) => {
    const u = new URL(url);
    calls.push(u);
    const last = u.pathname.split("/").pop()!;
    if (last.startsWith("rec")) {
      const i = Number(last.slice(3));
      return jsonResponse({ id: `rec${i}`, createdTime: created(i), fields: { n: i, name: `row ${i}` } });
    }
    const start = Number(u.searchParams.get("offset") || "0");
    const end = Math.min(start + 100, total);
    const only = u.searchParams.getAll("fields[]");
    const recs = [];
    for (let i = start; i < end; i++) {
      let fields: Record<string, unknown> = { n: i, name: `row ${i}` };
      if (only.length) fields = Object.fromEntries(Object.entries(fields).filter(([k]) => only.includes(k)));
      recs.push({ id: `rec${i}`, createdTime: created(i), fields });
    }
    const body: any = { records: recs };
    if (end < total) body.offset = String(end);
    return jsonResponse(body);
  };
  return { handler, calls };
}

describe("airtable", () => {
  const cfg = async () => ({ base_id: "appX", table: "Orders", view: null, pat_encrypted: await enc("pat") });
  it("pages with fields[] after page one; exact count; sample is page one", async () => {
    const { handler, calls } = airtable(250, 5);
    setFetchForTests(handler);
    const r = await fetchRecords(env, "airtable", await cfg());
    expect(r.error).toBeNull();
    expect(r.meta!.total).toBe(250);
    const pages = calls.filter((u) => u.searchParams.has("offset"));
    expect(pages.length).toBe(2);
    expect(pages.every((u) => u.searchParams.getAll("fields[]").join() === "n")).toBe(true);
    expect(calls[0].searchParams.has("fields[]")).toBe(false);
    expect(calls[0].searchParams.get("pageSize")).toBe("100");
    expect(r.records!.length).toBe(100);
    expect(r.records![0].n).toBe(5);
    expect(r.meta!.capped).toBe(false);
  });
  it("fetches the newest record by id when it is on a later page", async () => {
    const { handler, calls } = airtable(250, 230);
    setFetchForTests(handler);
    const r = await fetchRecords(env, "airtable", await cfg());
    expect(r.records![0].n).toBe(230);
    expect(r.records![0].name).toBe("row 230");
    expect(r.records!.length).toBe(101);
    expect(calls.filter((u) => u.pathname.endsWith("/rec230")).length).toBe(1);
  });
  it("caps at VR_AIRTABLE_MAX_PAGES and flags it", async () => {
    const { handler, calls } = airtable(1000, 1);
    setFetchForTests(handler);
    const r = await fetchRecords({ ...env, VR_AIRTABLE_MAX_PAGES: "2" }, "airtable", await cfg());
    expect(r.meta!.total).toBe(200);
    expect(r.meta!.capped).toBe(true);
    expect(calls.length).toBe(2);
  });
  it("single page makes one request; missing records array fails", async () => {
    const { handler, calls } = airtable(7, 3);
    setFetchForTests(handler);
    const r = await fetchRecords(env, "airtable", await cfg());
    expect(r.meta!.total).toBe(7);
    expect(calls.length).toBe(1);
    expect(r.records![0].n).toBe(3);
    setFetchForTests(async () => jsonResponse({ nope: [] }));
    expect((await fetchRecords(env, "airtable", await cfg())).error).toBe("Airtable response is missing the `records` array.");
  });
});
