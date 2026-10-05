import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTimeSlots, mergeSlotGrids } from "@/lib/available-slots";
import { findStaffByName, rowsForStaff, staffForService, type StaffMember } from "@/lib/staff";
import { buildSystemPrompt } from "@/lib/ai-assistant";
import { addDaysIso, nowInTimeZone } from "@/lib/business-time";

function fakeSupabase(tables: Record<string, { data: unknown; error?: unknown }>) {
  const query = (table: string) => {
    const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "in", "gte", "lte", "order", "limit"]) {
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

const HOURS = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [
    d,
    { start: "10:00", end: "13:00", enabled: true },
  ])
);

const member = (id: string, extra: Partial<StaffMember> = {}): StaffMember => ({
  id,
  name: id === "a" ? "Анна" : "Ольга",
  description: null,
  service_ids: [],
  working_hours: null,
  active: true,
  sort_order: 0,
  ...extra,
});

describe("staff helpers", () => {
  it("filters staff by service (empty list = all services)", () => {
    const staff = [member("a"), member("b", { service_ids: ["s2"] })];
    expect(staffForService(staff, "s1").map((s) => s.id)).toEqual(["a"]);
    expect(staffForService(staff, "s2").map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("finds staff by name case-insensitively and by prefix", () => {
    const staff = [member("a"), member("b")];
    expect(findStaffByName(staff, "анна")?.id).toBe("a");
    expect(findStaffByName(staff, "Оль")?.id).toBe("b");
    expect(findStaffByName(staff, "Ирина")).toBeNull();
  });

  it("bookings without staff block every staff member", () => {
    const rows = [
      { staff_id: "a", booking_time: "10:00" },
      { staff_id: null, booking_time: "11:00" },
      { staff_id: "b", booking_time: "12:00" },
    ];
    expect(rowsForStaff(rows, "a").map((r) => r.booking_time)).toEqual(["10:00", "11:00"]);
  });

  it("merges grids: free when anybody is free", () => {
    const merged = mergeSlotGrids([
      [
        { time: "10:00", available: false },
        { time: "11:00", available: true },
      ],
      [
        { time: "10:00", available: true },
        { time: "09:00", available: false },
      ],
    ]);
    expect(merged).toEqual([
      { time: "09:00", available: false },
      { time: "10:00", available: true },
      { time: "11:00", available: true },
    ]);
  });
});

describe("computeTimeSlots with staff", () => {
  const date = addDaysIso(nowInTimeZone().date, 7);
  const bookings = [
    { booking_time: "10:00:00", staff_id: "a", service: { duration_minutes: 60 } },
  ];

  it("a time taken by one master stays free with another", async () => {
    const supabase = fakeSupabase({
      staff: { data: [member("a"), member("b")] },
      bookings: { data: bookings },
      business_closures: { data: null },
      users: { data: { slot_step_minutes: null, buffer_minutes: 0 } },
    });
    const base = { businessId: "biz", date, durationMinutes: 60, workingHours: HOURS, serviceId: "s1" };
    const any = await computeTimeSlots(supabase, base);
    expect(any.find((s) => s.time === "10:00")?.available).toBe(true);
    const anna = await computeTimeSlots(supabase, { ...base, staffId: "a" });
    expect(anna.find((s) => s.time === "10:00")?.available).toBe(false);
    const olga = await computeTimeSlots(supabase, { ...base, staffId: "b" });
    expect(olga.find((s) => s.time === "10:00")?.available).toBe(true);
  });

  it("uses a master's personal schedule", async () => {
    const own = Object.fromEntries(
      Object.keys(HOURS).map((d) => [d, { start: "12:00", end: "13:00", enabled: true }])
    );
    const supabase = fakeSupabase({
      staff: { data: [member("b", { working_hours: own })] },
      bookings: { data: [] },
      business_closures: { data: null },
      users: { data: { slot_step_minutes: null, buffer_minutes: 0 } },
    });
    const slots = await computeTimeSlots(supabase, {
      businessId: "biz",
      date,
      durationMinutes: 60,
      workingHours: HOURS,
      serviceId: "s1",
      staffId: "b",
    });
    expect(slots.map((s) => s.time)).toEqual(["12:00"]);
  });

  it("without staff works as a single resource (old behaviour)", async () => {
    const supabase = fakeSupabase({
      staff: { data: null, error: { message: "relation staff does not exist" } },
      bookings: { data: [{ booking_time: "10:00:00", service: { duration_minutes: 60 } }] },
      business_closures: { data: null },
      users: { data: { slot_step_minutes: null, buffer_minutes: 0 } },
    });
    const slots = await computeTimeSlots(supabase, {
      businessId: "biz",
      date,
      durationMinutes: 60,
      workingHours: HOURS,
      serviceId: "s1",
    });
    expect(slots).toEqual([
      { time: "10:00", available: false },
      { time: "11:00", available: true },
      { time: "12:00", available: true },
    ]);
  });
});

describe("AI prompt", () => {
  it("lists staff with their services", () => {
    const prompt = buildSystemPrompt({ business_name: "Студия" }, [], [], [
      { name: "Анна", services: null },
      { name: "Ольга", description: "колорист", services: ["Окрашивание"] },
    ]);
    expect(prompt).toContain("- Анна (услуги: все)");
    expect(prompt).toContain("- Ольга — колорист (услуги: Окрашивание)");
  });
});
