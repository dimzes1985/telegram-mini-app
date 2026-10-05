import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkingHours } from "@/lib/booking-rules";

// A staff member (master, room, ...) who can be booked separately: two
// clients may book the same time with different staff members.
export interface StaffMember {
  id: string;
  name: string;
  description: string | null;
  // Services this staff member performs; empty = all services.
  service_ids: string[];
  // Personal schedule; null = business working hours.
  working_hours: WorkingHours | null;
  active: boolean;
  sort_order: number;
}

export const STAFF_FIELDS =
  "id, name, description, service_ids, working_hours, active, sort_order";

// Active, non-archived staff of a business in display order. Returns an empty
// list when there are no staff or the table does not exist yet
// (migration-step6-staff.sql not applied) - the business then works as a
// single resource exactly like before.
export async function listActiveStaff(
  supabase: SupabaseClient,
  businessId: string
): Promise<StaffMember[]> {
  try {
    const { data, error } = await supabase
      .from("staff")
      .select(STAFF_FIELDS)
      .eq("user_id", businessId)
      .eq("active", true)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !Array.isArray(data)) return [];
    return (data as unknown as StaffMember[]).map(normalizeStaff);
  } catch {
    return [];
  }
}

export function normalizeStaff(row: StaffMember): StaffMember {
  return {
    ...row,
    description: row.description ?? null,
    service_ids: Array.isArray(row.service_ids) ? row.service_ids : [],
    working_hours: row.working_hours ?? null,
    sort_order: row.sort_order ?? 0,
  };
}

// Staff members who perform the service.
export function staffForService(staff: StaffMember[], serviceId: string): StaffMember[] {
  return staff.filter((s) => s.service_ids.length === 0 || s.service_ids.includes(serviceId));
}

// Staff member's schedule, falling back to the business hours.
export function staffWorkingHours(
  member: StaffMember | null | undefined,
  businessHours: WorkingHours | null | undefined
): WorkingHours | null {
  return member?.working_hours ?? businessHours ?? null;
}

// Case-insensitive lookup by name (used by the AI assistant).
export function findStaffByName(staff: StaffMember[], name: string): StaffMember | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  return (
    staff.find((s) => s.name.trim().toLowerCase() === wanted) ??
    staff.find((s) => s.name.trim().toLowerCase().startsWith(wanted)) ??
    null
  );
}

// Booking row with its staff member, as loaded for overlap checks.
export interface StaffBookedRow {
  booking_time: string;
  staff_id?: string | null;
  service: { duration_minutes: number } | null;
}

// Bookings that occupy a staff member: their own ones plus bookings made
// before staff were added (staff_id NULL), which block everybody so nobody
// is double-booked during the switch.
export function rowsForStaff<T extends { staff_id?: string | null }>(
  rows: T[],
  staffId: string
): T[] {
  return rows.filter((r) => !r.staff_id || r.staff_id === staffId);
}
