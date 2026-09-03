import { describe, expect, it } from "vitest";
import { describeWindow, HeartbeatWindow, nextHeartbeatDue, wallClockToInstant } from "../src/schedule";

const KHI = "Asia/Karachi"; // UTC+5, no DST
const at = (local: string, tz = KHI) => wallClockToInstant(local, tz);
const iso = (d: Date) => d.toISOString();

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

describe("describeWindow", () => {
  it("names the window and the days", () => {
    expect(describeWindow({ start: "13:00", end: "23:00", tz: KHI })).toBe("active 13:00–23:00 Asia/Karachi");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [1, 2, 3, 4, 5] })).toBe("active 09:00–17:00 Asia/Karachi, Mon–Fri");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [1, 3, 5] })).toBe("active 09:00–17:00 Asia/Karachi, Mon, Wed, Fri");
    expect(describeWindow({ start: "09:00", end: "17:00", tz: KHI, days: [0, 6] })).toBe("active 09:00–17:00 Asia/Karachi, Sun, Sat");
  });
});
