import { describe, it, expect } from "vitest";
import { checkSlotRules, MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-rules";
import { dayNameOf, nowInTimeZone, isValidIsoDate } from "@/lib/business-time";

const hours = {
  monday: { start: "09:00", end: "18:00", enabled: true },
  tuesday: { start: "09:00", end: "18:00", enabled: true },
  sunday: { start: "10:00", end: "14:00", enabled: false },
};

// 2026-08-24 is a Monday. 06:30 UTC == 09:30 Moscow.
const now = new Date("2026-08-24T06:30:00Z");
const tz = "Europe/Moscow";

describe("business-time", () => {
  it("computes local date/time in the business time zone", () => {
    expect(nowInTimeZone(tz, now)).toEqual({ date: "2026-08-24", minutes: 9 * 60 + 30 });
    // 22:30 UTC on the 23rd is already the 24th in Moscow
    expect(nowInTimeZone(tz, new Date("2026-08-23T22:30:00Z")).date).toBe("2026-08-24");
  });

  it("gets the weekday independent of the server zone", () => {
    expect(dayNameOf("2026-08-24")).toBe("monday");
    expect(dayNameOf("2026-08-30")).toBe("sunday");
  });

  it("rejects impossible dates", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
  });
});

describe("checkSlotRules", () => {
  const base = { durationMinutes: 60, workingHours: hours, timeZone: tz, now };

  it("accepts a future slot inside working hours", () => {
    expect(checkSlotRules({ ...base, date: "2026-08-24", time: "10:00" })).toBeNull();
  });

  it("rejects past dates and past times today", () => {
    expect(checkSlotRules({ ...base, date: "2026-08-23", time: "10:00" })).toBe("past");
    expect(checkSlotRules({ ...base, date: "2026-08-24", time: "09:00" })).toBe("past");
  });

  it("rejects dates beyond the booking horizon", () => {
    const far = new Date(Date.UTC(2026, 7, 24 + MAX_BOOKING_DAYS_AHEAD + 1))
      .toISOString()
      .slice(0, 10);
    expect(checkSlotRules({ ...base, date: far, time: "10:00", workingHours: null })).toBe("too_far");
  });

  it("rejects closed days and slots that run past closing", () => {
    expect(checkSlotRules({ ...base, date: "2026-08-30", time: "11:00" })).toBe("closed");
    expect(checkSlotRules({ ...base, date: "2026-08-25", time: "17:30" })).toBe("outside_hours");
    expect(checkSlotRules({ ...base, date: "2026-08-25", time: "08:00" })).toBe("outside_hours");
  });

  it("rejects malformed input", () => {
    expect(checkSlotRules({ ...base, date: "2026-13-01", time: "10:00" })).toBe("invalid_date");
    expect(checkSlotRules({ ...base, date: "2026-08-25", time: "25:00" })).toBe("invalid_time");
  });
});
