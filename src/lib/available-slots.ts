import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween, isValidIsoDate, nowInTimeZone } from "@/lib/business-time";
import {
  MAX_BOOKING_DAYS_AHEAD,
  MIN_LEAD_MINUTES,
  overlapsBreak,
  workingWindow,
  type WorkingHours,
} from "@/lib/booking-rules";
import { getClosure } from "@/lib/closures";
import { findOverlappingSlot, minutesToTime, toBookedSlots, type BookedSlot } from "@/lib/slot";
import { loadActiveHolds } from "@/lib/holds";
import { gridStepMinutes, loadScheduleSettings } from "@/lib/schedule-settings";
import {
  listActiveStaff,
  rowsForStaff,
  staffForService,
  staffWorkingHours,
  type StaffBookedRow,
} from "@/lib/staff";

export interface TimeSlotInfo {
  time: string;
  available: boolean;
}

// One grid of slots for one resource (the business or one staff member).
export function buildSlotGrid(params: {
  date: string;
  durationMinutes: number;
  workingHours: WorkingHours | null | undefined;
  bookedSlots: BookedSlot[];
  step: number;
  bufferMinutes: number;
  // Minutes since midnight before which slots are hidden (today), or null.
  notBefore: number | null;
}): TimeSlotInfo[] {
  const { date, durationMinutes, bookedSlots, step, bufferMinutes, notBefore } = params;
  const window = workingWindow(params.workingHours, date);
  if (!window) return [];
  const slots: TimeSlotInfo[] = [];
  for (let m = window.start; m + durationMinutes <= window.end; m += step) {
    // A slot touching the break restarts the grid right after the break.
    if (overlapsBreak(window, m, durationMinutes) && window.breakEnd !== null) {
      m = window.breakEnd - step;
      continue;
    }
    if (notBefore !== null && m < notBefore) continue;
    const time = minutesToTime(m);
    slots.push({
      time,
      available: !findOverlappingSlot(bookedSlots, time, durationMinutes, bufferMinutes),
    });
  }
  return slots;
}

// "Any staff member": a time is shown when it exists in any grid and is free
// when at least one staff member is free then.
export function mergeSlotGrids(grids: TimeSlotInfo[][]): TimeSlotInfo[] {
  const byTime = new Map<string, boolean>();
  for (const grid of grids) {
    for (const slot of grid) {
      byTime.set(slot.time, (byTime.get(slot.time) ?? false) || slot.available);
    }
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, available]) => ({ time, available }));
}

// Builds the slot grid for one service on one date: inside working hours,
// not in the past (business time zone), within the booking horizon, and
// marked unavailable when it overlaps an active booking. With staff members
// the grid is per staff member (`staffId`), or merged over everybody who
// performs the service when no staff member is chosen.
export async function computeTimeSlots(
  supabase: SupabaseClient,
  params: {
    businessId: string;
    date: string;
    durationMinutes: number;
    workingHours: WorkingHours | null | undefined;
    serviceId?: string;
    staffId?: string | null;
    // The customer's own hold, which must not show as taken for them.
    holdToken?: string | null;
  }
): Promise<TimeSlotInfo[]> {
  const { businessId, date, durationMinutes, workingHours } = params;
  if (!isValidIsoDate(date)) return [];

  const local = nowInTimeZone();
  const daysAhead = daysBetween(local.date, date);
  if (daysAhead < 0 || daysAhead > MAX_BOOKING_DAYS_AHEAD) return [];

  if (await getClosure(supabase, businessId, date)) return [];

  const settings = await loadScheduleSettings(supabase, businessId);
  const step = gridStepMinutes(settings, durationMinutes);
  const notBefore = daysAhead === 0 ? local.minutes + MIN_LEAD_MINUTES : null;

  const allStaff = await listActiveStaff(supabase, businessId);
  // Times other customers are filling the form for count as occupied.
  const holds = await loadActiveHolds(supabase, businessId, date, params.holdToken);

  // No staff configured: the business is a single resource (old behaviour).
  if (allStaff.length === 0) {
    if (!workingWindow(workingHours, date)) return [];
    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("booking_time, service:services!inner(duration_minutes)")
      .eq("user_id", businessId)
      .eq("booking_date", date)
      .neq("status", "cancelled");
    return buildSlotGrid({
      date,
      durationMinutes,
      workingHours,
      bookedSlots: toBookedSlots([...(existingBookings ?? []), ...holds]),
      step,
      bufferMinutes: settings.bufferMinutes,
      notBefore,
    });
  }

  let candidates = params.serviceId ? staffForService(allStaff, params.serviceId) : allStaff;
  if (params.staffId) candidates = candidates.filter((s) => s.id === params.staffId);
  if (candidates.length === 0) return [];

  const { data } = await supabase
    .from("bookings")
    .select("booking_time, staff_id, service:services!inner(duration_minutes)")
    .eq("user_id", businessId)
    .eq("booking_date", date)
    .neq("status", "cancelled");
  const rows = [...((data ?? []) as unknown as StaffBookedRow[]), ...holds];

  const grids = candidates.map((member) =>
    buildSlotGrid({
      date,
      durationMinutes,
      workingHours: staffWorkingHours(member, workingHours),
      bookedSlots: toBookedSlots(rowsForStaff(rows, member.id)),
      step,
      bufferMinutes: settings.bufferMinutes,
      notBefore,
    })
  );
  return grids.length === 1 ? grids[0] : mergeSlotGrids(grids);
}
