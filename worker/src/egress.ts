/** Egress policy (literal-address form for Workers) and best-effort per-isolate rate limiting. */

const METADATA_HOSTS = new Set(["169.254.169.254", "fd00:ec2::254", "100.100.100.200", "metadata.google.internal", "metadata"]);

function parseHost(target: string): string | null {
  try {
    const u = new URL(target.includes("://") ? target : `http://${target}`);
    return u.hostname ? u.hostname.replace(/^\[|\]$/g, "").toLowerCase() : null;
  } catch {
    return null;
  }
}

function ipv4Private(h: string): boolean {
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function ipv6Private(h: string): boolean {
  if (!h.includes(":")) return false;
  const x = h.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("ff") || x.startsWith("::ffff:");
}

/** Message when `target` (URL or Postgres DSN) points at a literal non-public address, else null. */
export function egressViolation(target: string, allowPrivate: boolean): string | null {
  const host = parseHost(target);
  if (!host) return "Destination must be a public address (the URL has no host).";
  if (allowPrivate) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || METADATA_HOSTS.has(host) || ipv4Private(host) || ipv6Private(host)) {
    return `Destination must be a public address (${host} is private). Set VR_ALLOW_PRIVATE_EGRESS=1 on a self-hosted instance to allow it.`;
  }
  return null;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(public limit: number, public windowSeconds = 60, private clock: () => number = () => Date.now() / 1000) {}

  private prune(key: string, now: number): number[] {
    const arr = (this.hits.get(key) || []).filter((t) => t > now - this.windowSeconds);
    this.hits.set(key, arr);
    return arr;
  }

  allow(key: string): boolean {
    const now = this.clock();
    const arr = this.prune(key, now);
    if (arr.length >= this.limit) return false;
    arr.push(now);
    return true;
  }

  retryAfter(key: string): number {
    const now = this.clock();
    const arr = this.prune(key, now);
    if (!arr.length) return 0;
    return Math.max(0, Math.floor(arr[0] + this.windowSeconds - now) + 1);
  }
}
