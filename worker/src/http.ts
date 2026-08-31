/** FastAPI-shaped errors and responses so the frontend and tests see the same contract. */
export class HttpError extends Error {
  constructor(public status: number, public detail: unknown, public headers: Record<string, string> = {}) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

export async function readJson(request: Request): Promise<any> {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, [{ loc: ["body"], msg: "Invalid JSON", type: "value_error.jsondecode" }]);
  }
}

export function validation(msg: string, loc: (string | number)[] = ["body"]): HttpError {
  return new HttpError(422, [{ loc, msg, type: "value_error" }]);
}

/** Rate-limit key. CF-Connecting-IP is set by Cloudflare and cannot be chosen by the caller;
 *  X-Forwarded-For must never be consulted — Cloudflare APPENDS the real IP to a client-supplied
 *  value, so element 0 is attacker-chosen. Off-Cloudflare (no trusted header) every request shares
 *  one fallback bucket, which rate-limits collectively. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}
