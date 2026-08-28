import { SELF } from "cloudflare:test";

export const API = "http://api.test/api";
export const DEST_URL = "https://jsonplaceholder.typicode.com/todos";

export async function api(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers || {});
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await SELF.fetch(`${API}${path}`, { ...init, headers, body });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

let n = 0;
export async function user(prefix = "u") {
  const email = `${prefix}_${Date.now()}_${n++}@example.com`;
  const r = await api("/auth/register", { method: "POST", json: { email, password: "pass123" } });
  if (r.status !== 200) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { email, token: r.data.token as string, id: r.data.user.id as string };
}

export async function makeCheck(token: string, extra: Record<string, unknown> = {}) {
  const r = await api("/checks", {
    method: "POST",
    token,
    json: { name: "t", connector_kind: "http_json", config: { url: DEST_URL }, ...extra },
  });
  if (r.status !== 200) throw new Error(`create check failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

/** Route outbound fetches through a handler for the duration of `fn`. */
export async function withFetch<T>(handler: (url: string, init?: RequestInit) => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  (globalThis as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("http://api.test")) return real(input as any, init);
    return handler(url, init);
  };
  try {
    return await fn();
  } finally {
    (globalThis as any).fetch = real;
  }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
