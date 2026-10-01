import type { SupabaseClient } from "@supabase/supabase-js";
import { placeBooking, formatRuDate } from "@/lib/place-booking";
import { rateLimit } from "@/lib/rate-limit";

export interface CreateBookingInput {
  service_title: string;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // HH:MM
  customer_name: string;
  customer_phone?: string | null;
  customer_notes?: string | null;
}

// Verified messenger identity of the customer the assistant is talking to.
export interface BookingCustomer {
  source: "telegram" | "max";
  messengerId: string;
}

export type CreateBookingResult =
  | { ok: true; message: string; booking: unknown }
  | { ok: false; error: string };

// Creates a booking for a business from parsed natural-language input.
// Uses the same rules as POST /api/bookings (lib/booking-rules): the service
// must exist and be active, the slot must be in the future, inside working
// hours and free.
export async function createBookingForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  input: CreateBookingInput,
  customer?: BookingCustomer
): Promise<CreateBookingResult> {
  const bookingDate = input.booking_date.trim();
  const bookingTime = input.booking_time.trim().slice(0, 5);
  const customerName = input.customer_name.trim().slice(0, 200);

  if (!customerName) {
    return { ok: false, error: "Не указано имя клиента." };
  }

  if (customer) {
    const limit = await rateLimit(
      `bookings:ai:${businessId}:${customer.source}:${customer.messengerId}`,
      { windowMs: 60 * 60_000, max: 10 }
    );
    if (!limit.allowed) {
      return { ok: false, error: "Слишком много попыток записи, попробуйте позже." };
    }
  }

  const { data: business } = await supabase
    .from("users")
    .select(
      "bot_token, max_bot_token, working_hours, telegram_notify_chat_id, max_notify_user_id"
    )
    .eq("id", businessId)
    .maybeSingle();

  if (!business) {
    return { ok: false, error: "Бизнес не найден." };
  }

  // Find the requested service (case-insensitive exact title match).
  const { data: services } = await supabase
    .from("services")
    .select("id, title, price, duration_minutes")
    .eq("user_id", businessId)
    .eq("active", true);

  const wanted = input.service_title.trim().toLowerCase();
  const service = (services ?? []).find(
    (s) => s.title.trim().toLowerCase() === wanted
  );

  if (!service) {
    const available = (services ?? []).map((s) => `«${s.title}»`).join(", ");
    return {
      ok: false,
      error: `Услуга «${input.service_title}» не найдена. Доступные услуги: ${available || "список пуст"}.`,
    };
  }

  const result = await placeBooking({
    supabase,
    businessId,
    business,
    service,
    date: bookingDate,
    time: bookingTime,
    customerName,
    customerPhone: input.customer_phone?.trim().slice(0, 50) || null,
    customerNotes: input.customer_notes?.trim().slice(0, 1000) || null,
    source: customer?.source ?? "ai",
    viaAi: true,
    identity: customer
      ? { kind: "messenger", source: customer.source, messengerId: customer.messengerId }
      : undefined,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.code === "taken"
          ? "Это время уже занято. Предложите клиенту другое время."
          : result.message,
    };
  }

  return {
    ok: true,
    booking: result.booking,
    message: `Запись создана: ${service.title}, ${formatRuDate(bookingDate)} с ${bookingTime} до ${result.endTime}.`,
  };
}
