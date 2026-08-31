import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { b64encode, decryptSecret, encryptSecret } from "../src/crypto";

describe("decryptSecret failure semantics", () => {
  it("round-trips under the right key", async () => {
    const cipher = await encryptSecret(env.ENC_KEY, "https://hooks.slack.com/x");
    expect(await decryptSecret(env.ENC_KEY, cipher)).toBe("https://hooks.slack.com/x");
  });
  it("returns null, not the empty string, under the wrong key", async () => {
    const cipher = await encryptSecret(env.ENC_KEY, "hook");
    const otherKey = b64encode(crypto.getRandomValues(new Uint8Array(32)));
    expect(await decryptSecret(otherKey, cipher)).toBeNull();
  });
  it("returns null on truncated ciphertext", async () => {
    const cipher = await encryptSecret(env.ENC_KEY, "hook");
    expect(await decryptSecret(env.ENC_KEY, cipher.slice(0, 8))).toBeNull();
  });
  it("legacy empty ciphertext still yields the empty string", async () => {
    expect(await decryptSecret(env.ENC_KEY, "")).toBe("");
    expect(await decryptSecret(env.ENC_KEY, null)).toBe("");
    expect(await decryptSecret(env.ENC_KEY, undefined)).toBe("");
  });
});
