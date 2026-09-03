/** Heartbeat scheduling: when is the next run due. With no window the answer is `anchor + N h`;
 *  with one, the clock only runs inside the daily window (on the allowed days) in the Check's zone,
 *  so the due time is the instant at which N *active* hours have elapsed since the anchor.
 *  Every write site of `next_heartbeat_due_at` calls `nextHeartbeatDue` so they cannot disagree. */

export interface HeartbeatWindow {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local; end <= start wraps past midnight
  tz: string; // IANA zone
  days?: number[]; // 0 = Sunday … 6 = Saturday; absent = every day
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Calendar days the walk may cover. Validation (`activeMinutesWithinCap`) refuses any cadence that
 *  needs more active time than this many days can hold, so the flat fallback below is unreachable
 *  for a stored windowed Check — it exists only so the function is total. ~400 iterations of
 *  Intl formatting at worst; measured well under a millisecond per call. */
export const WALK_CAP_DAYS = 400;

interface LocalParts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  weekday: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock components of an instant in `tz`. */
export function localParts(instant: Date, tz: string): LocalParts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(instant)) out[p.type] = p.value;
  return {
    y: Number(out.year),
    m: Number(out.month),
    d: Number(out.day),
    h: Number(out.hour) % 24,
    mi: Number(out.minute),
    s: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday),
  };
}

/** Offset (ms) of `tz` from UTC at `instant`: local wall clock read as UTC, minus the instant. */
function offsetAt(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which `tz` shows the wall-clock time `YYYY-MM-DDTHH:MM[:SS]`. Across a DST gap
 *  the guess is refined once with the offset on the other side; a skipped wall time lands on the
 *  same offset-adjusted instant either way, which is what a scheduler wants. */
export function wallClockToInstant(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error(`bad local time: ${local}`);
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  return fromWallClockMs(asUtc, tz);
}

/** Wall time → instant. Existing times resolve exactly (one offset refinement covers both sides of a
 *  transition). A wall time that does not exist (inside a spring-forward gap) resolves to the
 *  transition instant itself, so the mapping is monotone across the gap and a period inside the gap
 *  has zero length instead of a negative one. */
function fromWallClockMs(asUtc: number, tz: string): Date {
  const o1 = offsetAt(new Date(asUtc), tz);
  const c1 = asUtc - o1;
  const o2 = offsetAt(new Date(c1), tz);
  if (o2 === o1) return new Date(c1);
  const c2 = asUtc - o2;
  const o3 = offsetAt(new Date(c2), tz);
  if (o3 === o2) return new Date(c2);
  // Non-existent wall time: the offset flips somewhere between the two candidates; find that instant.
  let lo = Math.min(c1, c2);
  let hi = Math.max(c1, c2);
  const hiOffset = offsetAt(new Date(hi), tz);
  for (let i = 0; i < 24 && hi - lo > 1000; i++) {
    const mid = Math.floor((lo + hi) / 2000) * 1000;
    if (offsetAt(new Date(mid), tz) === hiOffset) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function hhmm(s: string): { h: number; mi: number } {
  const [h, mi] = s.split(":").map(Number);
  return { h, mi };
}

/** The open period starting on local calendar day (y, m, d): [open, close) as instants. */
function periodOn(y: number, m: number, d: number, w: HeartbeatWindow): { open: Date; close: Date } {
  const s = hhmm(w.start);
  const e = hhmm(w.end);
  const wraps = e.h * 60 + e.mi <= s.h * 60 + s.mi;
  const open = fromWallClockMs(Date.UTC(y, m - 1, d, s.h, s.mi), w.tz);
  const close = fromWallClockMs(Date.UTC(y, m - 1, d + (wraps ? 1 : 0), e.h, e.mi), w.tz);
  return { open, close };
}

function dayAllowed(y: number, m: number, d: number, w: HeartbeatWindow): boolean {
  if (!w.days || !w.days.length) return true;
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w.days.includes(weekday);
}

/** Next due instant: N active hours after `anchor`. Null window = flat `anchor + N h`, exactly. */
export function nextHeartbeatDue(anchor: Date, hours: number, window: HeartbeatWindow | null | undefined): Date {
  const flat = new Date(anchor.getTime() + hours * HOUR);
  if (!window) return flat;
  let remaining = hours * HOUR;
  let t = anchor.getTime();
  // Start scanning one calendar day back so a wrapping window opened "yesterday" is seen.
  const p0 = localParts(anchor, window.tz);
  let dayCursor = Date.UTC(p0.y, p0.m - 1, p0.d) - DAY;
  const limit = dayCursor + (WALK_CAP_DAYS + 1) * DAY;
  while (dayCursor <= limit) {
    const c = new Date(dayCursor);
    const y = c.getUTCFullYear();
    const m = c.getUTCMonth() + 1;
    const d = c.getUTCDate();
    dayCursor += DAY;
    if (!dayAllowed(y, m, d, window)) continue;
    const { open, close } = periodOn(y, m, d, window);
    if (close.getTime() <= t) continue;
    if (open.getTime() > t) t = open.getTime();
    const avail = Math.max(0, close.getTime() - t);
    if (avail >= remaining) return new Date(t + remaining);
    remaining -= avail;
    t = Math.max(t, close.getTime());
  }
  return flat;
}

/** Open minutes on one (non-DST) day: `end <= start` wraps past midnight. */
export function openMinutesPerDay(w: HeartbeatWindow): number {
  const s = hhmm(w.start);
  const e = hhmm(w.end);
  const a = s.h * 60 + s.mi;
  const b = e.h * 60 + e.mi;
  return b > a ? b - a : b + 24 * 60 - a;
}

/** Lower bound on the active minutes the walk can find inside `WALK_CAP_DAYS`: whole weeks only, so
 *  a cadence that passes this check is always reachable and the flat fallback never runs. */
export function activeMinutesWithinCap(w: HeartbeatWindow): number {
  const daysPerWeek = w.days && w.days.length ? new Set(w.days).size : 7;
  return openMinutesPerDay(w) * daysPerWeek * Math.floor(WALK_CAP_DAYS / 7);
}

/** "active 13:00–23:00 Asia/Karachi" / "…, Mon–Fri" / "…, Mon, Wed, Fri" for the heartbeat message. */
export function describeWindow(w: HeartbeatWindow): string {
  let s = `active ${w.start}–${w.end} ${w.tz}`;
  const days = w.days && w.days.length ? [...new Set(w.days)] : null;
  if (days && days.length < 7) {
    const sorted = days.slice().sort((a, b) => a - b);
    const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (sorted.length >= 3 && contiguous) s += `, ${WEEKDAYS[sorted[0]]}–${WEEKDAYS[sorted[sorted.length - 1]]}`;
    else s += `, ${days.map((x) => WEEKDAYS[x]).join(", ")}`;
  }
  return s;
}
