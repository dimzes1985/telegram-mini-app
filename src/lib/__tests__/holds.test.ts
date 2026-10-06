import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTimeSlots } from "@/lib/available-slots";
import { findFreeResources } from "@/lib/place-booking";
import { holdsToRows, loadActiveHolds, sameTime } from "@/lib/holds";
import { addDaysIso, nowInTimeZone } from "@/lib/business-time";
import type { StaffMember } from "@/lib/staff";

function fakeSupabase(tables: Record<string, { data: unknown; error?: unknown }>) {
  const query = (table: string) => {
    const result = { data: tables[table]?.data ?? null, error: tables[table]?.error ?? null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "in", "gt", "gte", "lt", "lte", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve(result);
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

const member = (id: string): StaffMember => ({
  id,
  name: id,
  description: null,
  service_ids: [],
  working_hours: null,
  active: true,
  sort_order: 0,
});

const date = addDaysIso(nowInTimeZone().date, 7);
const hold = (time: string, staffId: string | null, token = "other-token") => ({
  booking_time: `${time}:00`,
  staff_id: staffId,
  duration_minutes: 60,
  token,
});

const common = {
  business_closures: { data: null },
  users: { data: { slot_step_minutes: null, buffer_minutes: 0 } },
  bookings: { data: [] },
};

describe("hold helpers", () => {
  it("maps holds to booking rows and skips the customer's own hold", () => {
    const rows = holdsToRows([hold("10:00", "a"), hold("11:00", null, "mine")], "mine");
    expect(rows).toEqual([
      { booking_time: "10:00:00", staff_id: "a", service: { duration_minutes: 60 } },
    ]);
  });

  it("treats HH:MM and HH:MM:SS as the same time", () => {
    expect(sameTime("10:00:00", "10:00")).toBe(true);
    expect(sameTime("10:30", "10:00")).toBe(false);
  });

  it("returns no holds when the table is missing", async () => {
    const supabase = fakeSupabase({ booking_holds: { data: null, error: { code: "42P01" } } });
    expect(await loadActiveHolds(supabase, "biz", date)).toEqual([]);
  });
});

describe("holds in the slot grid", () => {
  it("another customer's hold makes the time busy, own hold does not", async () => {
    const supabase = fakeSupabase({
      ...common,
      staff: { data: [] },
      booking_holds: { data: [hold("11:00", null, "t1")] },
    });
    const base = { businessId: "biz", date, durationMinutes: 60, workingHours: HOURS };
    const slots = await computeTimeSlots(supabase, base);
    expect(slots.find((s) => s.time === "11:00")?.available).toBe(false);
    expect(slots.find((s) => s.time === "10:00")?.available).toBe(true);
    const own = await computeTimeSlots(supabase, { ...base, holdToken: "t1" });
    expect(own.find((s) => s.time === "11:00")?.available).toBe(true);
  });

  it("a hold with one master leaves the time free with another", async () => {
    const supabase = fakeSupabase({
      ...common,
      staff: { data: [member("a"), member("b")] },
      booking_holds: { data: [hold("10:00", "a")] },
    });
    const base = { businessId: "biz", date, durationMinutes: 60, workingHours: HOURS, serviceId: "s1" };
    const any = await computeTimeSlots(supabase, base);
    expect(any.find((s) => s.time === "10:00")?.available).toBe(true);
    const a = await computeTimeSlots(supabase, { ...base, staffId: "a" });
    expect(a.find((s) => s.time === "10:00")?.available).toBe(false);
  });
});

describe("findFreeResources with holds", () => {
  const params = {
    businessId: "biz",
    businessHours: HOURS,
    serviceId: "s1",
    durationMinutes: 60,
    date,
    time: "11:00",
  };

  it("someone else's hold makes the time taken", async () => {
    const supabase = fakeSupabase({
      ...common,
      staff: { data: [] },
      booking_holds: { data: [hold("11:00", null)] },
    });
    const result = await findFreeResources({ supabase, ...params });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("taken");
  });

  it("the customer's own hold does not block them", async () => {
    const supabase = fakeSupabase({
      ...common,
      staff: { data: [] },
      booking_holds: { data: [hold("11:00", null, "mine")] },
    });
    const result = await findFreeResources({ supabase, ...params, holdToken: "mine" });
    expect(result).toEqual({ ok: true, free: [null] });
  });

  it("'any master' skips the master held by someone else", async () => {
    const supabase = fakeSupabase({
      ...common,
      staff: { data: [member("a"), member("b")] },
      booking_holds: { data: [hold("11:00", "a")] },
    });
    const result = await findFreeResources({ supabase, ...params });
    expect(result.ok && result.free.map((m) => m?.id)).toEqual(["b"]);
  });
});
