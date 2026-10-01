import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findOverlappingSlot } from "@/lib/slot";
import {
  DEFAULT_SCHEDULE_SETTINGS,
  gridStepMinutes,
  normalizeScheduleSettings,
} from "@/lib/schedule-settings";
import { settingsUpdateSchema } from "@/lib/settings-schema";
import { computeTimeSlots } from "@/lib/available-slots";
import { addDaysIso, nowInTimeZone } from "@/lib/business-time";

// Minimal chainable Supabase stub: every query on a table resolves to the
// configured result, whatever filters were applied.
function fakeSupabase(tables: Record<string, { data: unknown; error?: unknown }>) {
  const query = (table: string) => {
    const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "gte", "lte", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve(result);
    chain.single = () => Promise.resolve(result);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  return { from: query } as unknown as SupabaseClient;
}

const ALL_DAYS = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [
    d,
    { start: "10:00", end: "13:00", enabled: true },
  ])
);

describe("schedule settings", () => {
  it("normalizes DB rows and rejects junk", () => {
    expect(normalizeScheduleSettings({ slot_step_minutes: 30, buffer_minutes: 10 })).toEqual({
      slotStepMinutes: 30,
      bufferMinutes: 10,
    });
    expect(normalizeScheduleSettings({ slot_step_minutes: 7, buffer_minutes: -5 })).toEqual(
      DEFAULT_SCHEDULE_SETTINGS
    );
    expect(normalizeScheduleSettings(null)).toEqual(DEFAULT_SCHEDULE_SETTINGS);
  });

  it("steps by duration + pause unless a fixed step is chosen", () => {
    expect(gridStepMinutes(DEFAULT_SCHEDULE_SETTINGS, 60)).toBe(60);
    expect(gridStepMinutes(DEFAULT_SCHEDULE_SETTINGS, 10)).toBe(15);
    expect(gridStepMinutes({ slotStepMinutes: null, bufferMinutes: 15 }, 60)).toBe(75);
    expect(gridStepMinutes({ slotStepMinutes: 30, bufferMinutes: 15 }, 60)).toBe(30);
  });
});

describe("findOverlappingSlot with pause", () => {
  const existing = [{ startTime: "10:00", durationMinutes: 60 }];
  it("without pause the next client may start right after", () => {
    expect(findOverlappingSlot(existing, "11:00", 60)).toBeNull();
  });
  it("with pause the slot right after the booking is taken", () => {
    expect(findOverlappingSlot(existing, "11:00", 60, 15)).not.toBeNull();
    expect(findOverlappingSlot(existing, "11:15", 60, 15)).toBeNull();
  });
  it("the new booking's own pause must not run into the next booking", () => {
    // 08:45 + 60 min + 15 min pause ends at 10:00 -> fits; 09:00 does not.
    expect(findOverlappingSlot(existing, "08:45", 60, 15)).toBeNull();
    expect(findOverlappingSlot(existing, "09:00", 60, 15)).not.toBeNull();
  });
});

describe("settings schema", () => {
  it("accepts step and pause values", () => {
    const r = settingsUpdateSchema.safeParse({ slot_step_minutes: 30, buffer_minutes: 10 });
    expect(r.success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ slot_step_minutes: null }).success).toBe(true);
  });
  it("rejects bad values", () => {
    expect(settingsUpdateSchema.safeParse({ slot_step_minutes: 20 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ buffer_minutes: -1 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ buffer_minutes: 500 }).success).toBe(false);
  });
});

describe("computeTimeSlots", () => {
  const date = addDaysIso(nowInTimeZone().date, 7);

  it("uses a fixed 30-minute step", async () => {
    const supabase = fakeSupabase({
      users: { data: { slot_step_minutes: 30, buffer_minutes: 0 } },
      bookings: { data: [] },
      business_closures: { data: null },
    });
    const slots = await computeTimeSlots(supabase, {
      businessId: "b1",
      date,
      durationMinutes: 60,
      workingHours: ALL_DAYS,
    });
    expect(slots.map((s) => s.time)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
  });

  it("applies the pause around existing bookings", async () => {
    const supabase = fakeSupabase({
      users: { data: { slot_step_minutes: 30, buffer_minutes: 15 } },
      bookings: { data: [{ booking_time: "11:00:00", service: { duration_minutes: 30 } }] },
      business_closures: { data: null },
    });
    const slots = await computeTimeSlots(supabase, {
      businessId: "b1",
      date,
      durationMinutes: 30,
      workingHours: ALL_DAYS,
    });
    const free = slots.filter((s) => s.available).map((s) => s.time);
    // 10:30 + 30 + 15 = 11:15 > 11:00 -> busy; 11:30 is inside 11:00's pause.
    expect(free).toEqual(["10:00", "12:00", "12:30"]);
  });

  it("falls back to the old behaviour when the columns are missing", async () => {
    const supabase = fakeSupabase({
      users: { data: null, error: { message: "column does not exist" } },
      bookings: { data: [] },
      business_closures: { data: null },
    });
    const slots = await computeTimeSlots(supabase, {
      businessId: "b1",
      date,
      durationMinutes: 60,
      workingHours: ALL_DAYS,
    });
    expect(slots.map((s) => s.time)).toEqual(["10:00", "11:00", "12:00"]);
  });
});
