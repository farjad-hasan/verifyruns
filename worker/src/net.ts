/** Single outbound HTTP seam so tests can swap the transport (the Python port used `_http_client()`). */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response> | Response;

let override: FetchLike | null = null;

export function setFetchForTests(fn: FetchLike | null): void {
  override = fn;
}

export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (override) return override(url, init);
  return fetch(url, init);
}

/** Read a body stream, abandoning it past `maxBytes`. Returns null when exceeded. */
export async function readCapped(resp: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!resp.body) return new Uint8Array();
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
