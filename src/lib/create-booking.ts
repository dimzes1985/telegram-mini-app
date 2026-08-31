import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOwner } from "@/lib/notify-owner";
import {
  bookingEndTime,
  findOverlappingSlot,
  timeToMinutes,
  toBookedSlots,
} from "@/lib/slot";

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
  const startMinutes = timeToMinutes(bookingTime);
  if (startMinutes === null) {
    return { ok: false, error: "Неверный формат времени (нужен ЧЧ:ММ)." };
  }
  const endTime = bookingEndTime(bookingTime, durationMinutes);

  // Validate the requested time fits within the business working hours,
  // including the full service duration (start and end inside the work day).
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
    const dayStart = timeToMinutes(dayHours.start);
    const dayEnd = timeToMinutes(dayHours.end);
    if (
      dayStart === null ||
      dayEnd === null ||
      startMinutes < dayStart ||
      startMinutes + durationMinutes > dayEnd
    ) {
      return {
        ok: false,
        error: `Время вне режима работы: библиотека работает с ${dayHours.start} до ${dayHours.end}.`,
      };
    }
  }

  // Check for bookings that overlap the requested interval. A service takes
  // `duration_minutes`, so a booking blocks the whole [start, start+duration)
  // window, not just its starting minute.
  const { data: existing } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", businessId)
    .eq("booking_date", bookingDate)
    .neq("status", "cancelled");

  const existingSlots = toBookedSlots(existing);

  if (findOverlappingSlot(existingSlots, bookingTime, durationMinutes)) {
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
    // The unique index on (user_id, booking_date, booking_time) and the
    // overlap trigger both guard races between the check and the insert.
    if (error.code === "23505" || error.code === "23P01") {
      return {
        ok: false,
        error: "Это время уже занято. Предложите клиенту другое время.",
      };
    }
    return { ok: false, error: "Не удалось создать запись, попробуйте ещё раз." };
  }

  // Notify the owner. Await delivery so the message is not dropped when the
  // request lifecycle ends; notifyOwner never rejects, so a failed
  // notification cannot fail the booking.
  if (business) {
    await notifyOwner(business, [
      "🔔 Новая запись!",
      "",
      `🛠 Услуга: ${service.title}`,
      `📅 Дата: ${formatDate(bookingDate)}`,
      `🕒 Время: ${bookingTime}–${endTime}`,
      `👤 Клиент: ${input.customer_name}`,
      `📞 Телефон: ${input.customer_phone || "не указан"}`,
    ].join("\n"));
  }

  return {
    ok: true,
    booking,
    message: `Запись создана: ${service.title}, ${formatDate(bookingDate)} с ${bookingTime} до ${endTime}.`,
  };
}
