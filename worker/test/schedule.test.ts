import { describe, expect, it } from "vitest";
import { activeMinutesWithinCap, describeWindow, HeartbeatWindow, nextHeartbeatDue, wallClockToInstant, WALK_CAP_DAYS } from "../src/schedule";

const KHI = "Asia/Karachi"; // UTC+5, no DST
const at = (local: string, tz = KHI) => wallClockToInstant(local, tz);
const iso = (d: Date) => d.toISOString();
const HOUR = 3600_000;

describe("nextHeartbeatDue (pure)", () => {
  it("null window is exactly anchor + hours", () => {
    const a = new Date("2026-08-27T12:00:00.000Z");
    expect(nextHeartbeatDue(a, 24, null).getTime()).toBe(a.getTime() + 24 * 3600_000);
    expect(nextHeartbeatDue(a, 1, null).getTime()).toBe(a.getTime() + 3600_000);
  });

  it("overnight gap: 22:30 run in a 13:00–23:00 window is due 13:30 next day (30 min left of the hour)", () => {
    const w: HeartbeatWindow = { start: "13:00", end: "23:00", tz: KHI };
    expect(iso(nextHeartbeatDue(at("2026-09-03T22:30"), 1, w))).toBe(iso(at("2026-09-04T13:30")));
  });

  it("miss inside the window still fires: 13:00 run, 1 h → 14:00 same day", () => {
    const w: HeartbeatWindow = { start: "13:00", end: "23:00", tz: KHI };
    expect(iso(nextHeartbeatDue(at("2026-09-03T13:00"), 1, w))).toBe(iso(at("2026-09-03T14:00")));
  });

  it("weekend is skipped: Fri 16:00, 2 h, Mon–Fri 09:00–17:00 → Mon 10:00", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "17:00", tz: KHI, days: [1, 2, 3, 4, 5] };
    // 2026-09-04 is a Friday
    expect(iso(nextHeartbeatDue(at("2026-09-04T16:00"), 2, w))).toBe(iso(at("2026-09-07T10:00")));
  });

  it("wrapping window 22:00–06:00: 05:30 run, 1 h → 22:30 the same day", () => {
    const w: HeartbeatWindow = { start: "22:00", end: "06:00", tz: KHI };
    expect(iso(nextHeartbeatDue(at("2026-09-03T05:30"), 1, w))).toBe(iso(at("2026-09-03T22:30")));
  });

  it("anchor outside the window: 03:00 run, window 09–17 → 09:00 + N", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "17:00", tz: KHI };
    expect(iso(nextHeartbeatDue(at("2026-09-03T03:00"), 3, w))).toBe(iso(at("2026-09-03T12:00")));
  });

  it("cadence longer than one day's window spans days", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "17:00", tz: KHI };
    // 8 h open per day: 12 h of active time from 09:00 = 17:00 today + 4 h tomorrow = 13:00 tomorrow
    expect(iso(nextHeartbeatDue(at("2026-09-03T09:00"), 12, w))).toBe(iso(at("2026-09-04T13:00")));
  });

  it("DST: Europe/London spring-forward keeps wall-clock hours", () => {
    const LON = "Europe/London"; // 2026-03-29 01:00 UTC clocks go forward
    const w: HeartbeatWindow = { start: "09:00", end: "17:00", tz: LON };
    // Saturday 16:00 GMT run, 2 h cadence, no day filter → 17:00 Sat (1 h) + Sunday 09:00 + 1 h = 10:00 BST
    const due = nextHeartbeatDue(at("2026-03-28T16:00", LON), 2, w);
    expect(iso(due)).toBe(iso(at("2026-03-29T10:00", LON)));
    expect(iso(due)).toBe("2026-03-29T09:00:00.000Z"); // 10:00 BST is 09:00 UTC
  });

  it("wallClockToInstant is exact for a fixed-offset zone and for both sides of DST", () => {
    expect(iso(at("2026-09-03T14:00"))).toBe("2026-09-03T09:00:00.000Z");
    expect(iso(at("2026-01-15T12:00", "Europe/London"))).toBe("2026-01-15T12:00:00.000Z");
    expect(iso(at("2026-07-15T12:00", "Europe/London"))).toBe("2026-07-15T11:00:00.000Z");
  });
});

describe("long cadences never fall back to flat arithmetic (review 1)", () => {
  it("400 h over Mon–Fri 09:00–17:00 walks 10 working weeks", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "17:00", tz: KHI, days: [1, 2, 3, 4, 5] };
    // Mon 2026-09-07 09:00: 400 h = 50 working days = 10 weeks → closes Fri 2026-11-13 17:00
    expect(iso(nextHeartbeatDue(at("2026-09-07T09:00"), 400, w))).toBe(iso(at("2026-11-13T17:00")));
  });
  it("100 h over a 1 h/day window walks 100 days", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "10:00", tz: KHI };
    expect(iso(nextHeartbeatDue(at("2026-09-03T09:00"), 100, w))).toBe(iso(at("2026-12-11T10:00")));
  });
  it("720 h (the maximum) over a 4 h/day every-day window is reachable inside the cap", () => {
    const w: HeartbeatWindow = { start: "09:00", end: "13:00", tz: KHI };
    const due = nextHeartbeatDue(at("2026-09-03T09:00"), 720, w);
    expect(due.getTime()).toBe(at("2026-09-03T09:00").getTime() + 179 * 24 * HOUR + 4 * HOUR);
  });
  it("capacity: whole weeks inside the cap minus two spring-forward days", () => {
    const weeks = Math.floor(WALK_CAP_DAYS / 7);
    const wk: HeartbeatWindow = { start: "09:00", end: "17:00", tz: KHI, days: [1, 2, 3, 4, 5] };
    expect(activeMinutesWithinCap(wk)).toBe(8 * 60 * 5 * weeks - 2 * 60);
    const tiny: HeartbeatWindow = { start: "09:00", end: "09:30", tz: KHI, days: [0] };
    expect(activeMinutesWithinCap(tiny)).toBe(30 * weeks - 2 * 30);
    const wrap: HeartbeatWindow = { start: "22:00", end: "06:00", tz: KHI };
    expect(activeMinutesWithinCap(wrap)).toBe(8 * 60 * 7 * weeks - 2 * 60);
  });

  it("the bound holds on windows that sit inside the spring-forward gap (re-review 1)", () => {
    const LON = "Europe/London";
    const NYC = "America/New_York";
    const flat = (a: Date, h: number) => a.getTime() + h * HOUR;
    // Daily 01:00–02:00 London: 57 × 7 = 399 h nominal, two springs collapse two of them → bound 397 h.
    const daily: HeartbeatWindow = { start: "01:00", end: "02:00", tz: LON };
    expect(activeMinutesWithinCap(daily)).toBe(397 * 60);
    const a = at("2026-03-28T02:00", LON);
    const due397 = nextHeartbeatDue(a, 397, daily);
    expect(due397.getTime()).not.toBe(flat(a, 397)); // walked, not flat
    expect(due397.getTime()).toBeGreaterThan(a.getTime() + 398 * 24 * HOUR); // 397 active hours ≈ 399 calendar days
    // Sunday-only 01:00–02:00 London: 57 Sundays nominal, 2026-03-29 and 2027-03-28 are both spring Sundays → 55.
    const sun: HeartbeatWindow = { start: "01:00", end: "02:00", tz: LON, days: [0] };
    expect(activeMinutesWithinCap(sun)).toBe(55 * 60);
    const due55 = nextHeartbeatDue(a, 55, sun);
    expect(due55.getTime()).not.toBe(flat(a, 55));
    expect(iso(due55)).toBe(iso(at("2027-04-25T02:00", LON)));
    // New York 02:00–03:00 daily has the same shape.
    const ny: HeartbeatWindow = { start: "02:00", end: "03:00", tz: NYC };
    expect(activeMinutesWithinCap(ny)).toBe(397 * 60);
    const b = at("2026-03-07T03:00", NYC);
    expect(nextHeartbeatDue(b, 397, ny).getTime()).not.toBe(flat(b, 397));
  });
});

describe("DST gaps (review 2)", () => {
  const LON = "Europe/London"; // 2026-03-29: 01:00Z clocks go 01:00 → 02:00
  const NYC = "America/New_York"; // 2026-03-08: 07:00Z clocks go 02:00 → 03:00
  it("wall-clock mapping is monotone across the London gap", () => {
    const times = ["00:30", "00:59", "01:00", "01:15", "01:45", "02:00", "02:15", "03:00"];
    const inst = times.map((t) => at(`2026-03-29T${t}`, LON).getTime());
    for (let i = 1; i < inst.length; i++) expect(inst[i]).toBeGreaterThanOrEqual(inst[i - 1]);
    expect(iso(at("2026-03-29T02:00", LON))).toBe("2026-03-29T01:00:00.000Z");
    expect(iso(at("2026-03-29T03:00", LON))).toBe("2026-03-29T02:00:00.000Z");
  });
  it("a window straddling the London gap never yields a negative period; due is never sooner than the real elapsed hours", () => {
    const w: HeartbeatWindow = { start: "00:00", end: "04:00", tz: LON };
    const a = at("2026-03-29T00:00", LON);
    const due = nextHeartbeatDue(a, 2, w);
    expect(due.getTime()).toBe(a.getTime() + 2 * HOUR); // 03:00 BST = 02:00Z
    expect(iso(due)).toBe("2026-03-29T02:00:00.000Z");
  });
  it("a window entirely inside the London gap collapses to zero and the walk moves on", () => {
    const w: HeartbeatWindow = { start: "01:15", end: "01:45", tz: LON };
    const a = at("2026-03-28T12:00", LON);
    const due = nextHeartbeatDue(a, 1, w);
    expect(due.getTime()).toBeGreaterThanOrEqual(a.getTime() + HOUR);
    // 30 min/day window: 1 h needs two full days after the collapsed 29th → 31st 01:45 GMT+1
    expect(iso(due)).toBe(iso(at("2026-03-31T01:45", LON)));
  });
  it("New York spring-forward: straddling and inside-gap windows behave the same way", () => {
    const straddle: HeartbeatWindow = { start: "01:00", end: "03:30", tz: NYC };
    const a = at("2026-03-08T01:00", NYC); // 06:00Z
    expect(iso(a)).toBe("2026-03-08T06:00:00.000Z");
    const due = nextHeartbeatDue(a, 1, straddle);
    expect(iso(due)).toBe("2026-03-08T07:00:00.000Z"); // one real hour later, 03:00 EDT
    const inside: HeartbeatWindow = { start: "02:15", end: "02:45", tz: NYC };
    const d2 = nextHeartbeatDue(at("2026-03-07T12:00", NYC), 1, inside);
    expect(d2.getTime()).toBeGreaterThanOrEqual(at("2026-03-07T12:00", NYC).getTime() + HOUR);
    expect(iso(d2)).toBe(iso(at("2026-03-10T02:45", NYC)));
  });
});

describe("describeWindow", () => {
  it("names the window and the days", () => {
    expect(describeWindow({ start: "13:00", end: "23:00", tz: KHI })).toBe("active 13:00–23:00 Asia/Karachi");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [1, 2, 3, 4, 5] })).toBe("active 09:00–17:00 Asia/Karachi, Mon–Fri");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [1, 3, 5] })).toBe("active 09:00–17:00 Asia/Karachi, Mon, Wed, Fri");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [0, 6] })).toBe("active 09:00–17:00 Asia/Karachi, Sun, Sat");
  });
});
