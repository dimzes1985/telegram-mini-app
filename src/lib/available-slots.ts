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
import { findOverlappingSlot, minutesToTime, toBookedSlots } from "@/lib/slot";

export interface TimeSlotInfo {
  time: string;
  available: boolean;
}

// Builds the slot grid for one service on one date: inside working hours,
// not in the past (business time zone), within the booking horizon, and
// marked unavailable when it overlaps an active booking.
export async function computeTimeSlots(
  supabase: SupabaseClient,
  params: {
    businessId: string;
    date: string;
    durationMinutes: number;
    workingHours: WorkingHours | null | undefined;
  }
): Promise<TimeSlotInfo[]> {
  const { businessId, date, durationMinutes, workingHours } = params;
  if (!isValidIsoDate(date)) return [];

  const local = nowInTimeZone();
  const daysAhead = daysBetween(local.date, date);
  if (daysAhead < 0 || daysAhead > MAX_BOOKING_DAYS_AHEAD) return [];

  const window = workingWindow(workingHours, date);
  if (!window) return [];

  if (await getClosure(supabase, businessId, date)) return [];

  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", businessId)
    .eq("booking_date", date)
    .neq("status", "cancelled");

  const bookedSlots = toBookedSlots(existingBookings);

  // The grid steps by the service duration so a slot never overlaps the next
  // slot of the same service, and every slot fits inside the work day.
  const slots: TimeSlotInfo[] = [];
  const step = Math.max(15, durationMinutes);
  for (let m = window.start; m + durationMinutes <= window.end; m += step) {
    // A slot touching the break restarts the grid right after the break.
    if (overlapsBreak(window, m, durationMinutes) && window.breakEnd !== null) {
      m = window.breakEnd - step;
      continue;
    }
    if (daysAhead === 0 && m < local.minutes + MIN_LEAD_MINUTES) continue;
    const time = minutesToTime(m);
    slots.push({
      time,
      available: !findOverlappingSlot(bookedSlots, time, durationMinutes),
    });
  }
  return slots;
}
