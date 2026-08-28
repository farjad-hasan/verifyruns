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
