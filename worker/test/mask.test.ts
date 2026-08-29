import { describe, expect, it } from "vitest";
import { maskQueryValues } from "../src/crypto";
import { api, makeCheck, user } from "./helpers";

describe("maskQueryValues (query-string values never leave the API unmasked)", () => {
  it("returns a URL without a query unchanged", () => {
    expect(maskQueryValues("https://host/rest/v1/t")).toBe("https://host/rest/v1/t");
    expect(maskQueryValues("https://host/a#frag")).toBe("https://host/a#frag");
    expect(maskQueryValues("https://host/a#b?c=secret")).toBe("https://host/a#b?c=secret");
  });

  it("masks one key to •••• + last 4, keeping key, path, host and fragment", () => {
    expect(maskQueryValues("https://host:8443/rest/v1/t?apikey=abcdefgh1234#top")).toBe("https://host:8443/rest/v1/t?apikey=••••1234#top");
  });

  it("masks repeated keys each on their own", () => {
    expect(maskQueryValues("https://host/t?k=abcdefgh1234&k=zyxwvuts9876")).toBe("https://host/t?k=••••1234&k=••••9876");
  });

  it("masks values of 4 chars or fewer as •••• + the whole value", () => {
    expect(maskQueryValues("https://host/rest/v1/t?select=id&apikey=abcdefgh1234")).toBe("https://host/rest/v1/t?select=••••id&apikey=••••1234");
    expect(maskQueryValues("https://host/t?a=abcd&b=")).toBe("https://host/t?a=••••abcd&b=••••");
    expect(maskQueryValues("https://host/t?flag")).toBe("https://host/t?flag");
  });

  it("returns unparseable input unchanged", () => {
    expect(maskQueryValues("not a url?x=secret")).toBe("not a url?x=secret");
    expect(maskQueryValues("")).toBe("");
  });

  it("is applied to config.url on every sanitised http_json Check", async () => {
    const u = await user();
    const raw = "https://jsonplaceholder.typicode.com/todos?select=id&apikey=abcdefgh1234";
    const masked = "https://jsonplaceholder.typicode.com/todos?select=••••id&apikey=••••1234";
    const c = await makeCheck(u.token, { config: { url: raw } });
    expect(c.config.url).toBe(masked);
    expect((await api(`/checks/${c.id}`, { token: u.token })).data.config.url).toBe(masked);
    expect((await api("/checks", { token: u.token })).data[0].config.url).toBe(masked);
    const p = await api(`/checks/${c.id}`, { method: "PATCH", token: u.token, json: { name: "renamed" } });
    expect(p.data.config.url).toBe(masked);
    expect(JSON.stringify(p.data)).not.toContain("abcdefgh1234");
  });
});
