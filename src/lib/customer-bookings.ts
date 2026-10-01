import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween, nowInTimeZone } from "@/lib/business-time";
import { timeToMinutes } from "@/lib/slot";
import type { MessengerCustomer } from "@/lib/customer-auth";

// Customers may cancel themselves until this many minutes before the start.
export const CUSTOMER_CANCEL_CUTOFF_MINUTES = 120;
// Max number of device-stored tokens accepted in one request.
export const MAX_MANAGE_TOKENS = 50;

export type CustomerScope =
  | { kind: "messenger"; customer: MessengerCustomer }
  | { kind: "tokens"; tokens: string[] };

export interface CustomerBookingView {
  id: string;
  booking_date: string;
  booking_time: string;
  status: "pending" | "confirmed" | "cancelled";
  service_title: string;
  duration_minutes: number;
  price: number | null;
  can_cancel: boolean;
}

const BOOKING_FIELDS =
  "id, booking_date, booking_time, status, customer_name, service:services(title, duration_minutes, price)";

interface BookingRow {
  id: string;
  booking_date: string;
  booking_time: string;
  status: "pending" | "confirmed" | "cancelled";
  customer_name: string;
  service: { title: string; duration_minutes: number; price: number | null } | null;
}

// Minutes from "now" (business time zone) until the booking starts.
export function minutesUntilStart(date: string, time: string, now?: Date): number {
  const local = nowInTimeZone(undefined, now);
  const start = timeToMinutes(time) ?? 0;
  return daysBetween(local.date, date) * 1440 + start - local.minutes;
}

export function canCustomerCancel(row: { booking_date: string; booking_time: string; status: string }): boolean {
  return (
    row.status !== "cancelled" &&
    minutesUntilStart(row.booking_date, row.booking_time) >= CUSTOMER_CANCEL_CUTOFF_MINUTES
  );
}

function toView(row: BookingRow): CustomerBookingView {
  return {
    id: row.id,
    booking_date: row.booking_date,
    booking_time: row.booking_time.slice(0, 5),
    status: row.status,
    service_title: row.service?.title ?? "Услуга",
    duration_minutes: row.service?.duration_minutes ?? 30,
    price: row.service?.price ?? null,
    can_cancel: canCustomerCancel(row),
  };
}

// Restricts a bookings query to rows owned by the customer.
function scoped<T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(
  query: T,
  scope: CustomerScope
): T {
  return scope.kind === "messenger"
    ? query
        .eq("source", scope.customer.source)
        .eq("customer_messenger_id", scope.customer.messengerId)
    : query.in("manage_token", scope.tokens);
}

// Upcoming bookings (today and later) of one customer at one business.
export async function listCustomerBookings(
  supabase: SupabaseClient,
  businessId: string,
  scope: CustomerScope
): Promise<{ data: CustomerBookingView[]; error: string | null }> {
  if (scope.kind === "tokens" && scope.tokens.length === 0) {
    return { data: [], error: null };
  }
  const today = nowInTimeZone().date;
  const base = supabase
    .from("bookings")
    .select(BOOKING_FIELDS)
    .eq("user_id", businessId)
    .gte("booking_date", today);

  const { data, error } = await scoped(base, scope)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(50);

  if (error) {
    console.error("listCustomerBookings failed:", error);
    return { data: [], error: "Не удалось загрузить записи" };
  }

  const views = ((data ?? []) as unknown as BookingRow[])
    .map(toView)
    // Hide past slots of today
    .filter((b) => minutesUntilStart(b.booking_date, b.booking_time) > -b.duration_minutes);
  return { data: views, error: null };
}

export type CancelResult =
  | { ok: true; booking: CustomerBookingView; customerName: string }
  | { ok: false; status: number; error: string };

// Cancels a booking if it belongs to the customer and is not too close.
export async function cancelCustomerBooking(
  supabase: SupabaseClient,
  businessId: string,
  bookingId: string,
  scope: CustomerScope
): Promise<CancelResult> {
  const base = supabase
    .from("bookings")
    .select(BOOKING_FIELDS)
    .eq("user_id", businessId)
    .eq("id", bookingId);

  const { data, error } = await scoped(base, scope).maybeSingle();
  if (error) {
    console.error("cancelCustomerBooking lookup failed:", error);
    return { ok: false, status: 500, error: "Не удалось отменить запись" };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Запись не найдена" };
  }

  const row = data as unknown as BookingRow;
  if (row.status === "cancelled") {
    return { ok: false, status: 409, error: "Запись уже отменена" };
  }
  if (!canCustomerCancel(row)) {
    return {
      ok: false,
      status: 409,
      error: `Отменить запись можно не позднее чем за ${CUSTOMER_CANCEL_CUTOFF_MINUTES / 60} ч до начала. Свяжитесь с нами напрямую.`,
    };
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: "customer" })
    .eq("id", bookingId)
    .eq("user_id", businessId)
    .neq("status", "cancelled");

  if (updateError) {
    console.error("cancelCustomerBooking update failed:", updateError);
    return { ok: false, status: 500, error: "Не удалось отменить запись" };
  }

  return {
    ok: true,
    booking: { ...toView(row), status: "cancelled", can_cancel: false },
    customerName: row.customer_name,
  };
}
