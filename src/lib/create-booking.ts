import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOwner } from "@/lib/notify-owner";

export interface CreateBookingInput {
  service_title: string;
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // HH:MM
  customer_name: string;
  customer_phone?: string | null;
  customer_notes?: string | null;
}

export type CreateBookingResult =
  | { ok: true; message: string; booking: unknown }
  | { ok: false; error: string };

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Formats "2026-08-24" as "24.08.2026".
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Creates a booking for a business from parsed natural-language input.
// Reuses the same validation rules as POST /api/bookings: the service must
// exist and be active, the slot must be free and inside working hours.
export async function createBookingForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const bookingDate = input.booking_date;
  const bookingTime = input.booking_time;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    return { ok: false, error: "Неверный формат даты (нужен ГГГГ-ММ-ДД)." };
  }
  if (!/^\d{2}:\d{2}$/.test(bookingTime)) {
    return { ok: false, error: "Неверный формат времени (нужен ЧЧ:ММ)." };
  }

  // Reject dates in the past.
  const dateObj = new Date(`${bookingDate}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) {
    return { ok: false, error: "Некорректная дата." };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) {
    return { ok: false, error: "Нельзя записаться на прошедшую дату." };
  }

  const { data: business } = await supabase
    .from("users")
    .select(
      "bot_token, max_bot_token, working_hours, telegram_notify_chat_id, max_notify_user_id"
    )
    .eq("id", businessId)
    .single();

  // Find the requested service (case-insensitive exact title match).
  const { data: services } = await supabase
    .from("services")
    .select("id, title, price")
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

  // Validate the requested time is within the business working hours.
  if (business?.working_hours) {
    const dayName = DAY_NAMES[dateObj.getDay()];
    const dayHours = (
      business.working_hours as Record<
        string,
        { start: string; end: string; enabled: boolean }
      >
    )[dayName];

    if (!dayHours?.enabled) {
      return { ok: false, error: "Библиотека в этот день не работает." };
    }
    if (bookingTime < dayHours.start || bookingTime > dayHours.end) {
      return {
        ok: false,
        error: `Время вне режима работы: библиотека работает с ${dayHours.start} до ${dayHours.end}.`,
      };
    }
  }

  // Check for conflicting bookings in the same slot.
  const { data: existing } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", businessId)
    .eq("booking_date", bookingDate)
    .eq("booking_time", bookingTime)
    .neq("status", "cancelled");

  if (existing && existing.length > 0) {
    return {
      ok: false,
      error: "Это время уже занято. Предложите клиенту другое время.",
    };
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      service_id: service.id,
      user_id: businessId,
      booking_date: bookingDate,
      booking_time: bookingTime,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      customer_notes: input.customer_notes ?? null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "Это время уже занято. Предложите клиенту другое время.",
      };
    }
    return { ok: false, error: "Не удалось создать запись, попробуйте ещё раз." };
  }

  // Notify the owner (non-blocking).
  if (business) {
    notifyOwner(business, [
      "🔔 Новая запись!",
      "",
      `🛠 Услуга: ${service.title}`,
      `📅 Дата: ${formatDate(bookingDate)}`,
      `🕒 Время: ${bookingTime}`,
      `👤 Клиент: ${input.customer_name}`,
      `📞 Телефон: ${input.customer_phone || "не указан"}`,
    ].join("\n"));
  }

  return {
    ok: true,
    booking,
    message: `Запись создана: ${service.title}, ${formatDate(bookingDate)} в ${bookingTime}.`,
  };
}
