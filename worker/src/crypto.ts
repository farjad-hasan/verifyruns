/** WebCrypto-only primitives: AES-GCM secrets at rest, PBKDF2 passwords, HS256 JWTs. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const b64url = (bytes: ArrayBuffer | Uint8Array): string => b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const b64urlDecode = (s: string): Uint8Array => b64decode(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

/** Equivalent of Python's secrets.token_urlsafe(n). */
export function tokenUrlsafe(nBytes: number): string {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export const uuid = (): string => crypto.randomUUID();

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- secrets at rest (AES-256-GCM under ENC_KEY) ----------

let cachedKey: { raw: string; key: CryptoKey } | null = null;

async function aesKey(encKey: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.raw === encKey) return cachedKey.key;
  const raw = b64decode(encKey);
  if (raw.length !== 32) throw new Error("ENC_KEY must be 32 bytes, base64-encoded");
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  cachedKey = { raw: encKey, key };
  return key;
}

export async function encryptSecret(encKey: string, plain: string): Promise<string> {
  if (!plain) return "";
  const key = await aesKey(encKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64encode(out);
}

/** `""` means "nothing stored" (legacy empty); `null` means "something is stored but unreadable"
 *  (wrong key, corrupt ciphertext). Callers must treat `null` as a failure, never as absence. */
export async function decryptSecret(encKey: string, cipher: string | null | undefined): Promise<string | null> {
  if (!cipher) return "";
  try {
    const key = await aesKey(encKey);
    const bytes = b64decode(cipher);
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  } catch {
    return null;
  }
}

export function maskToken(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 4) return "•".repeat(plain.length);
  return "•".repeat(8) + plain.slice(-4);
}

/**
 * Mask every query-string VALUE in a URL to `••••` + its last 4 characters (values of 4 chars or
 * fewer keep the whole value after the dots). Keys, path, host and fragment are untouched, so the
 * shape of the destination stays readable while an `?apikey=` can never leave the API in clear.
 * Unparseable input and URLs without a query are returned unchanged. Pure string work on purpose:
 * the `URL.search` setter would percent-encode the dots and re-encode keys.
 */
/** The four dots every masked value starts with; clients that echo a sanitised value back are detected by it. */
export const MASK = "••••";

export function maskQueryValues(url: string): string {
  try {
    new URL(url);
  } catch {
    return url;
  }
  const hashIdx = url.indexOf("#");
  const qIdx = url.indexOf("?");
  if (qIdx === -1 || (hashIdx !== -1 && qIdx > hashIdx)) return url;
  const end = hashIdx === -1 ? url.length : hashIdx;
  const query = url
    .slice(qIdx + 1, end)
    .split("&")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return part;
      const value = part.slice(eq + 1);
      return `${part.slice(0, eq)}=${MASK}${value.slice(-4)}`;
    })
    .join("&");
  return url.slice(0, qIdx + 1) + query + url.slice(end);
}

// ---------- passwords (PBKDF2-SHA256) ----------

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64encode(salt)}$${b64encode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iter, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const bits = await pbkdf2(password, b64decode(saltB64), Number(iter));
    return timingSafeEqual(b64encode(bits), hashB64);
  } catch {
    return false;
  }
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

// ---------- JWT HS256 ----------

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export type JwtResult = { ok: true; payload: any } | { ok: false; reason: "expired" | "invalid" };

export async function verifyJwt(token: string, secret: string): Promise<JwtResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid" };
  const [header, body, sig] = parts;
  try {
    const expected = b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${header}.${body}`)));
    if (!timingSafeEqual(expected, sig)) return { ok: false, reason: "invalid" };
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
