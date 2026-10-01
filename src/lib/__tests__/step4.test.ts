import { describe, it, expect } from "vitest";
import { checkSlotRules, workingWindow, overlapsBreak } from "@/lib/booking-rules";
import { settingsUpdateSchema } from "@/lib/settings-schema";
import { buildStatusText } from "@/lib/notify-customer";

const now = new Date("2026-08-24T05:00:00Z"); // Mon 08:00 Moscow
const hours = {
  monday: { start: "09:00", end: "18:00", enabled: true, break_start: "13:00", break_end: "14:00" },
  tuesday: { start: "09:00", end: "18:00", enabled: true },
};
const base = { durationMinutes: 60, workingHours: hours, timeZone: "Europe/Moscow", now };

describe("lunch break", () => {
  it("parses the break window", () => {
    const w = workingWindow(hours, "2026-08-24")!;
    expect(w.breakStart).toBe(13 * 60);
    expect(w.breakEnd).toBe(14 * 60);
    expect(overlapsBreak(w, 12 * 60 + 30, 60)).toBe(true);
    expect(overlapsBreak(w, 12 * 60, 60)).toBe(false);
    expect(overlapsBreak(w, 14 * 60, 60)).toBe(false);
  });

  it("rejects slots that overlap the break", () => {
    expect(checkSlotRules({ ...base, date: "2026-08-24", time: "12:30" })).toBe("on_break");
    expect(checkSlotRules({ ...base, date: "2026-08-24", time: "12:00" })).toBeNull();
    expect(checkSlotRules({ ...base, date: "2026-08-24", time: "14:00" })).toBeNull();
  });

  it("ignores a break outside working hours", () => {
    const w = workingWindow(
      { monday: { start: "09:00", end: "18:00", enabled: true, break_start: "19:00", break_end: "20:00" } },
      "2026-08-24"
    )!;
    expect(w.breakStart).toBeNull();
  });
});

describe("days off", () => {
  it("rejects bookings on a closed date", () => {
    expect(checkSlotRules({ ...base, date: "2026-08-25", time: "10:00", isClosedDate: true })).toBe("holiday");
  });
});

describe("settings break validation", () => {
  const day = (extra: object) => ({ start: "09:00", end: "18:00", enabled: true, ...extra });
  it("accepts a valid break and empty break", () => {
    expect(settingsUpdateSchema.safeParse({ working_hours: { monday: day({ break_start: "13:00", break_end: "14:00" }) } }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ working_hours: { monday: day({ break_start: "", break_end: "" }) } }).success).toBe(true);
  });
  it("rejects half-filled or out-of-hours breaks", () => {
    expect(settingsUpdateSchema.safeParse({ working_hours: { monday: day({ break_start: "13:00" }) } }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ working_hours: { monday: day({ break_start: "08:00", break_end: "09:30" }) } }).success).toBe(false);
  });
});

describe("customer status message", () => {
  const booking = {
    booking_date: "2026-08-25",
    booking_time: "10:00:00",
    service: { title: "Маникюр", duration_minutes: 90 },
  };
  it("describes confirmation and cancellation", () => {
    expect(buildStatusText(booking, "confirmed", "Студия", true)).toContain("подтверждена");
    expect(buildStatusText(booking, "confirmed", "Студия", true)).toContain("10:00–11:30");
    expect(buildStatusText(booking, "cancelled", null, false)).toContain("отменена");
  });
});
