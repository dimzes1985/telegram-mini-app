import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOwner, type OwnerNotifyTargets } from "@/lib/notify-owner";
import { bookingEndTime, findOverlappingSlot, toBookedSlots } from "@/lib/slot";
import { checkSlotRules, SLOT_RULE_MESSAGES, type WorkingHours } from "@/lib/booking-rules";
import {
  hasTooManyActiveBookings,
  TOO_MANY_BOOKINGS_MESSAGE,
  type CustomerIdentity,
} from "@/lib/booking-guard";
import { insertBooking } from "@/lib/insert-booking";
import { getClosure } from "@/lib/closures";

export type BookingSource = "telegram" | "max" | "mobile" | "ai";

const SOURCE_LABELS: Record<BookingSource, string> = {
  telegram: "Telegram",
  max: "MAX",
  mobile: "Веб-приложение",
  ai: "AI-ассистент",
};

export interface PlaceBookingInput {
  supabase: SupabaseClient;
  businessId: string;
  business: OwnerNotifyTargets & { working_hours?: unknown };
  service: { id: string; title: string; duration_minutes: number | null };
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  customerName: string;
  customerPhone?: string | null;
  customerNotes?: string | null;
  source: BookingSource;
  // Booking was made by the AI assistant on behalf of the customer.
  viaAi?: boolean;
  identity?: CustomerIdentity;
  select?: string;
}

export type PlaceBookingResult =
  | { ok: true; booking: Record<string, unknown> | null; endTime: string }
  | {
      ok: false;
      code: "rules" | "too_many" | "taken" | "error";
      message: string;
    };

const TAKEN_MESSAGE = "Это время уже занято. Выберите другое.";

// Formats "2026-08-24" as "24.08.2026".
export function formatRuDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// The single booking pipeline used by every channel (mini-app, mobile web,
// AI assistant): slot rules -> per-customer limit -> overlap check -> insert
// (DB constraints guard races) -> owner notification.
export async function placeBooking(input: PlaceBookingInput): Promise<PlaceBookingResult> {
  const { supabase, businessId, business, service, date, time, source, identity } = input;
  const durationMinutes = service.duration_minutes ?? 30;

  const ruleError = checkSlotRules({
    date,
    time,
    durationMinutes,
    workingHours: (business.working_hours ?? null) as WorkingHours | null,
    isClosedDate: Boolean(await getClosure(supabase, businessId, date)),
  });
  if (ruleError) {
    return { ok: false, code: "rules", message: SLOT_RULE_MESSAGES[ruleError] };
  }

  if (identity && (await hasTooManyActiveBookings(supabase, businessId, identity))) {
    return { ok: false, code: "too_many", message: TOO_MANY_BOOKINGS_MESSAGE };
  }

  const { data: existing } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", businessId)
    .eq("booking_date", date)
    .neq("status", "cancelled");

  if (findOverlappingSlot(toBookedSlots(existing), time, durationMinutes)) {
    return { ok: false, code: "taken", message: TAKEN_MESSAGE };
  }

  const { data: booking, error } = await insertBooking(
    supabase,
    {
      service_id: service.id,
      user_id: businessId,
      booking_date: date,
      booking_time: time,
      customer_name: input.customerName,
      customer_phone: input.customerPhone || null,
      customer_notes: input.customerNotes || null,
      status: "pending",
    },
    {
      source,
      customer_messenger_id: identity?.kind === "messenger" ? identity.messengerId : null,
    },
    input.select
  );

  if (error) {
    // 23505: unique start index; 23P01: bookings_no_overlap exclusion
    // constraint. Both mean a concurrent request took the slot.
    if (error.code === "23505" || error.code === "23P01") {
      return { ok: false, code: "taken", message: TAKEN_MESSAGE };
    }
    console.error("Booking insert failed:", error);
    return {
      ok: false,
      code: "error",
      message: "Не удалось создать запись, попробуйте ещё раз.",
    };
  }

  const endTime = bookingEndTime(time, durationMinutes);

  const lines = [
    "🔔 Новая запись!",
    "",
    `🛠 Услуга: ${service.title}`,
    `📅 Дата: ${formatRuDate(date)}`,
    `🕒 Время: ${time}–${endTime}`,
    `👤 Клиент: ${input.customerName}`,
    `📞 Телефон: ${input.customerPhone || "не указан"}`,
  ];
  if (input.customerNotes) lines.push(`📝 Комментарий: ${input.customerNotes}`);
  const sourceLabel =
    input.viaAi && source !== "ai"
      ? `AI-ассистент (${SOURCE_LABELS[source]})`
      : SOURCE_LABELS[source];
  lines.push(`📲 Источник: ${sourceLabel}`);

  // Awaited so serverless does not drop it; notifyOwner never rejects.
  await notifyOwner(business, lines.join("\n"));

  return { ok: true, booking, endTime };
}
