import type { SupabaseClient } from "@supabase/supabase-js";
import { nowInTimeZone } from "@/lib/business-time";

// Max upcoming (not cancelled) bookings one customer may hold per business.
// Protects businesses from a single person blocking the whole schedule.
export const MAX_ACTIVE_BOOKINGS_PER_CUSTOMER = 3;

export type CustomerIdentity =
  | { kind: "phone"; phoneDigits: string }
  | { kind: "messenger"; source: "telegram" | "max"; messengerId: string };

// Counts the customer's upcoming active bookings at this business.
// Returns null if the check could not run (e.g. the migration adding the
// columns has not been applied yet) so the booking is not blocked by it.
export async function countActiveCustomerBookings(
  supabase: SupabaseClient,
  businessId: string,
  identity: CustomerIdentity,
  timeZone?: string
): Promise<number | null> {
  const today = nowInTimeZone(timeZone).date;
  let query = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", businessId)
    .neq("status", "cancelled")
    .gte("booking_date", today);

  query =
    identity.kind === "phone"
      ? query.eq("customer_phone_digits", identity.phoneDigits)
      : query
          .eq("source", identity.source)
          .eq("customer_messenger_id", identity.messengerId);

  const { count, error } = await query;
  if (error) {
    console.error("countActiveCustomerBookings failed:", error.message);
    return null;
  }
  return count ?? 0;
}

export async function hasTooManyActiveBookings(
  supabase: SupabaseClient,
  businessId: string,
  identity: CustomerIdentity,
  timeZone?: string
): Promise<boolean> {
  const count = await countActiveCustomerBookings(
    supabase,
    businessId,
    identity,
    timeZone
  );
  return count !== null && count >= MAX_ACTIVE_BOOKINGS_PER_CUSTOMER;
}

export const TOO_MANY_BOOKINGS_MESSAGE = `У вас уже ${MAX_ACTIVE_BOOKINGS_PER_CUSTOMER} активные записи. Отмените одну из них или свяжитесь с нами, чтобы записаться ещё.`;
