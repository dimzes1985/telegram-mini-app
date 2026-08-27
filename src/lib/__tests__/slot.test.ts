import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  intervalsOverlap,
  bookingEndTime,
  findOverlappingSlot,
  type BookedSlot,
} from "@/lib/slot";

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("parses HH:MM:SS from Postgres TIME", () => {
    expect(timeToMinutes("10:30:00")).toBe(630);
  });

  it("returns null for malformed times", () => {
    expect(timeToMinutes("9:30")).toBeNull();
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("10:70")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes("ten")).toBeNull();
  });
});

describe("minutesToTime", () => {
  it("formats minutes as HH:MM", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(630)).toBe("10:30");
    expect(minutesToTime(1439)).toBe("23:59");
  });
});

describe("intervalsOverlap", () => {
  it("detects overlapping half-open intervals", () => {
    expect(intervalsOverlap(0, 60, 30, 60)).toBe(true);
    expect(intervalsOverlap(30, 60, 0, 60)).toBe(true);
    expect(intervalsOverlap(0, 60, 59, 1)).toBe(true);
  });

  it("does not count touching intervals as overlap", () => {
    expect(intervalsOverlap(0, 60, 60, 60)).toBe(false);
    expect(intervalsOverlap(60, 60, 0, 60)).toBe(false);
  });

  it("allows disjoint intervals", () => {
    expect(intervalsOverlap(0, 30, 60, 30)).toBe(false);
  });
});

describe("bookingEndTime", () => {
  it("adds duration to the start time", () => {
    expect(bookingEndTime("14:00", 60)).toBe("15:00");
    expect(bookingEndTime("09:30", 45)).toBe("10:15");
  });

  it("handles seconds-carrying DB times", () => {
    expect(bookingEndTime("10:30:00", 90)).toBe("12:00");
  });
});

describe("findOverlappingSlot", () => {
  const existing: BookedSlot[] = [
    { startTime: "09:00", durationMinutes: 60 }, // 09:00-10:00
    { startTime: "11:00:00", durationMinutes: 30 }, // 11:00-11:30
  ];

  it("returns the conflicting slot", () => {
    expect(findOverlappingSlot(existing, "09:30", 30)).toEqual(existing[0]);
    expect(findOverlappingSlot(existing, "10:30", 60)).toEqual(existing[1]);
    expect(findOverlappingSlot(existing, "10:45", 30)).toEqual(existing[1]);
  });

  it("returns null for a free slot", () => {
    expect(findOverlappingSlot(existing, "10:00", 60)).toBeNull();
    expect(findOverlappingSlot(existing, "11:30", 30)).toBeNull();
    expect(findOverlappingSlot(existing, "08:00", 60)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(findOverlappingSlot([], "09:00", 60)).toBeNull();
  });
});
