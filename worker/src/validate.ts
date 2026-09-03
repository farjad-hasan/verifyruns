import { egressViolation } from "./egress";
import { validation } from "./http";
import { activeMinutesWithinCap, HeartbeatWindow, WALK_CAP_DAYS } from "./schedule";

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

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `{start, end, tz, days?}` or null. Callers enforce "window requires heartbeat_hours". */
export function parseHeartbeatWindow(v: unknown): HeartbeatWindow | null {
  if (v === undefined || v === null) return null;
  const loc = (k: string) => ["body", "heartbeat_window", k];
  if (typeof v !== "object" || Array.isArray(v)) throw validation("heartbeat_window must be an object {start, end, tz, days?}", ["body", "heartbeat_window"]);
  const src = v as Record<string, unknown>;
  for (const k of ["start", "end"] as const) {
    if (typeof src[k] !== "string" || !HHMM.test(src[k] as string)) throw validation(`${k} must be HH:MM (24 h)`, loc(k));
  }
  if (typeof src.tz !== "string" || !src.tz) throw validation("tz must be an IANA time zone", loc("tz"));
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: src.tz });
  } catch {
    throw validation(`tz "${src.tz}" is not a known time zone`, loc("tz"));
  }
  const out: HeartbeatWindow = { start: src.start as string, end: src.end as string, tz: src.tz };
  if (src.days !== undefined && src.days !== null) {
    const d = src.days;
    const ok = Array.isArray(d) && d.length > 0 && d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6) && new Set(d).size === d.length;
    if (!ok) throw validation("days must be a non-empty list of distinct integers 0–6 (0 = Sunday)", loc("days"));
    out.days = (d as number[]).slice().sort((a, b) => a - b);
  }
  return out;
}

/** A windowed cadence must be reachable inside the scheduler's walk cap, or the due time could never be
 *  computed honestly. Checked with the *effective* pair on create and patch. */
export function validateHeartbeatCapacity(hours: number | null, window: HeartbeatWindow | null): void {
  if (!hours || !window) return;
  const have = activeMinutesWithinCap(window);
  if (hours * 60 > have) {
    throw validation(
      `heartbeat_window is too narrow for the cadence: ${hours} h of active time is not reachable within ${WALK_CAP_DAYS} days (this window offers about ${Math.floor(have / 60)} h). Widen the window, add days, or shorten heartbeat_hours.`,
      ["body", "heartbeat_window"],
    );
  }
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
