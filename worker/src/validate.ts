import { egressViolation } from "./egress";
import { validation } from "./http";

export const CONNECTOR_KINDS = ["http_json", "airtable", "postgres"] as const;

export const GROWTH_MODES = ["growth", "steady", "claimed"] as const;
export type GrowthMode = (typeof GROWTH_MODES)[number];

export interface Expectations {
  min_new_records: number;
  required_fields: string[];
  non_empty_fields: string[];
  growth_mode: GrowthMode;
}

export function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function parseExpectations(input: unknown, base?: Expectations): Expectations {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Expectations = base
    ? { ...base }
    : { min_new_records: 1, required_fields: [], non_empty_fields: [], growth_mode: "growth" };
  if ("min_new_records" in src) {
    const n = Number(src.min_new_records);
    if (!Number.isInteger(n) || n < 0) throw validation("min_new_records must be an integer >= 0", ["body", "expectations", "min_new_records"]);
    out.min_new_records = n;
  }
  for (const k of ["required_fields", "non_empty_fields"] as const) {
    if (k in src) {
      const v = src[k];
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw validation(`${k} must be a list of strings`, ["body", "expectations", k]);
      out[k] = v;
    }
  }
  if ("growth_mode" in src) {
    const g = src.growth_mode;
    if (!GROWTH_MODES.includes(g as GrowthMode)) throw validation("growth_mode must be growth, steady or claimed", ["body", "expectations", "growth_mode"]);
    out.growth_mode = g as GrowthMode;
  }
  if (!base) {
    out.min_new_records = "min_new_records" in src ? out.min_new_records : 1;
  }
  return out;
}

export function parseHeartbeat(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 720) throw validation("heartbeat_hours must be an integer between 1 and 720", ["body", "heartbeat_hours"]);
  return n;
}

export function parseName(v: unknown): string {
  if (typeof v !== "string" || v.length < 1 || v.length > 120) throw validation("name must be 1–120 characters", ["body", "name"]);
  return v;
}

export const CHANNEL_KINDS = ["slack", "discord", "email"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export function parseChannel(body: any): { kind: ChannelKind; target: string } {
  if (!body || !CHANNEL_KINDS.includes(body.kind)) throw validation("kind must be slack, discord or email", ["body", "kind"]);
  if (typeof body.target !== "string" || body.target.length < 3 || body.target.length > 2000) throw validation("target must be 3–2000 characters", ["body", "target"]);
  return { kind: body.kind, target: body.target };
}

/** Shape-check an alert target at save time: webhooks must be public http(s) URLs, emails must be emails. */
export function validateChannelTarget(kind: ChannelKind, target: string, allowPrivate: boolean, loc: (string | number)[]): void {
  if (kind === "email") {
    if (!isEmail(target)) throw validation("target must be an email address", loc);
    return;
  }
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    throw validation("target must be an http(s) URL", loc);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw validation("target must be an http(s) URL", loc);
  const v = egressViolation(target, allowPrivate);
  if (v) throw validation(v, loc);
}
