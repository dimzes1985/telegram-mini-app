import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffBookedRow } from "@/lib/staff";

// How long a picked time stays reserved while the customer fills the form.
export const HOLD_MINUTES = 5;
// Max simultaneous holds from one client (IP) so nobody can block the day.
export const MAX_HOLDS_PER_CLIENT = 3;

export interface BookingHold {
  id: string;
  user_id: string;
  service_id: string;
  staff_id: string | null;
  booking_date: string;
  booking_time: string;
  duration_minutes: number;
  token: string;
  expires_at: string;
}

const HOLD_FIELDS =
  "id, user_id, service_id, staff_id, booking_date, booking_time, duration_minutes, token, expires_at";

interface HoldRowLite {
  booking_time: string;
  staff_id: string | null;
  duration_minutes: number | null;
  token: string;
}

// Active holds of other customers on a date, shaped like booking rows so the
// usual overlap checks treat them as occupied time. Returns [] when the
// table does not exist yet (migration-step7-holds.sql not applied).
export async function loadActiveHolds(
  supabase: SupabaseClient,
  businessId: string,
  date: string,
  excludeToken?: string | null
): Promise<StaffBookedRow[]> {
  try {
    const { data, error } = await supabase
      .from("booking_holds")
      .select("booking_time, staff_id, duration_minutes, token")
      .eq("user_id", businessId)
      .eq("booking_date", date)
      .gt("expires_at", new Date().toISOString());
    if (error || !Array.isArray(data)) return [];
    return holdsToRows(data as unknown as HoldRowLite[], excludeToken);
  } catch {
    return [];
  }
}

export function holdsToRows(
  holds: HoldRowLite[],
  excludeToken?: string | null
): StaffBookedRow[] {
  return holds
    .filter((h) => !excludeToken || h.token !== excludeToken)
    .map((h) => ({
      booking_time: h.booking_time,
      staff_id: h.staff_id,
      service: { duration_minutes: h.duration_minutes ?? 30 },
    }));
}

// The customer's own hold, when it is still valid.
export async function getActiveHold(
  supabase: SupabaseClient,
  token: string | null | undefined
): Promise<BookingHold | null> {
  if (!token) return null;
  try {
    const { data, error } = await supabase
      .from("booking_holds")
      .select(HOLD_FIELDS)
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as BookingHold;
  } catch {
    return null;
  }
}

export async function deleteHold(
  supabase: SupabaseClient,
  token: string | null | undefined
): Promise<void> {
  if (!token) return;
  try {
    await supabase.from("booking_holds").delete().eq("token", token);
  } catch {
    // Holds expire on their own.
  }
}

// "10:00:00" and "10:00" are the same time.
export function sameTime(a: string, b: string): boolean {
  return a.slice(0, 5) === b.slice(0, 5);
}
