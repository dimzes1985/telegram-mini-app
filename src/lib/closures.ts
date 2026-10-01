import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso, daysBetween, nowInTimeZone } from "@/lib/business-time";
import { MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-rules";

export interface Closure {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string | null;
}

// Days off / holidays of one business on a specific date. Fails open (not
// closed) if the table is missing, so bookings keep working before the
// migration is applied.
export async function getClosure(
  supabase: SupabaseClient,
  businessId: string,
  date: string
): Promise<Closure | null> {
  const { data, error } = await supabase
    .from("business_closures")
    .select("id, date, reason")
    .eq("user_id", businessId)
    .eq("date", date)
    .maybeSingle();
  if (error) {
    console.warn("getClosure failed (migration-step4.sql applied?):", error.message);
    return null;
  }
  return (data as Closure | null) ?? null;
}

// Upcoming closures within the booking horizon (today .. +MAX days).
export async function listUpcomingClosures(
  supabase: SupabaseClient,
  businessId: string
): Promise<Closure[]> {
  const today = nowInTimeZone().date;
  const last = addDaysIso(today, MAX_BOOKING_DAYS_AHEAD);
  const { data, error } = await supabase
    .from("business_closures")
    .select("id, date, reason")
    .eq("user_id", businessId)
    .gte("date", today)
    .lte("date", last)
    .order("date", { ascending: true });
  if (error) {
    console.warn("listUpcomingClosures failed:", error.message);
    return [];
  }
  return (data ?? []) as Closure[];
}

export function isUpcomingDate(date: string): boolean {
  const ahead = daysBetween(nowInTimeZone().date, date);
  return ahead >= 0 && ahead <= 366;
}
