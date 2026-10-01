import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOwner } from "@/lib/notify-owner";
import { bookingEndTime, findOverlappingSlot, toBookedSlots } from "@/lib/slot";
import { checkSlotRules, SLOT_RULE_MESSAGES, type WorkingHours } from "@/lib/booking-rules";
import {
  hasTooManyActiveBookings,
  TOO_MANY_BOOKINGS_MESSAGE,
} from "@/lib/booking-guard";
import { insertBooking } from "@/lib/insert-booking";
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

// Formats "2026-08-24" as "24.08.2026".
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

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

  const durationMinutes = service.duration_minutes ?? 30;

  const ruleError = checkSlotRules({
    date: bookingDate,
    time: bookingTime,
    durationMinutes,
    workingHours: business.working_hours as WorkingHours | null,
  });
  if (ruleError) {
    return { ok: false, error: SLOT_RULE_MESSAGES[ruleError] };
  }

  if (
    customer &&
    (await hasTooManyActiveBookings(supabase, businessId, {
      kind: "messenger",
      source: customer.source,
      messengerId: customer.messengerId,
    }))
  ) {
    return { ok: false, error: TOO_MANY_BOOKINGS_MESSAGE };
  }

  const endTime = bookingEndTime(bookingTime, durationMinutes);

  // Check for bookings that overlap the requested interval.
  const { data: existing } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", businessId)
    .eq("booking_date", bookingDate)
    .neq("status", "cancelled");

  if (findOverlappingSlot(toBookedSlots(existing), bookingTime, durationMinutes)) {
    return {
      ok: false,
      error: "Это время уже занято. Предложите клиенту другое время.",
    };
  }

  const { data: booking, error } = await insertBooking(
    supabase,
    {
      service_id: service.id,
      user_id: businessId,
      booking_date: bookingDate,
      booking_time: bookingTime,
      customer_name: customerName,
      customer_phone: input.customer_phone?.trim().slice(0, 50) || null,
      customer_notes: input.customer_notes?.trim().slice(0, 1000) || null,
      status: "pending",
    },
    {
      source: customer?.source ?? "ai",
      customer_messenger_id: customer?.messengerId ?? null,
    }
  );

  if (error) {
    // 23505: unique start index; 23P01: bookings_no_overlap exclusion
    // constraint. Both mean a concurrent request took the slot.
    if (error.code === "23505" || error.code === "23P01") {
      return {
        ok: false,
        error: "Это время уже занято. Предложите клиенту другое время.",
      };
    }
    console.error("AI booking insert failed:", error);
    return { ok: false, error: "Не удалось создать запись, попробуйте ещё раз." };
  }

  // Notify the owner. notifyOwner never rejects, so a failed notification
  // cannot fail the booking.
  await notifyOwner(business, [
    "🔔 Новая запись!",
    "",
    `🛠 Услуга: ${service.title}`,
    `📅 Дата: ${formatDate(bookingDate)}`,
    `🕒 Время: ${bookingTime}–${endTime}`,
    `👤 Клиент: ${customerName}`,
    `📞 Телефон: ${input.customer_phone || "не указан"}`,
    "📲 Источник: AI-ассистент",
  ].join("\n"));

  return {
    ok: true,
    booking,
    message: `Запись создана: ${service.title}, ${formatDate(bookingDate)} с ${bookingTime} до ${endTime}.`,
  };
}
