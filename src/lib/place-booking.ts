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
import { loadScheduleSettings } from "@/lib/schedule-settings";
import { deleteHold, getActiveHold, loadActiveHolds, sameTime } from "@/lib/holds";
import {
  listActiveStaff,
  rowsForStaff,
  staffForService,
  staffWorkingHours,
  type StaffBookedRow,
  type StaffMember,
} from "@/lib/staff";

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
  // Chosen staff member; null/undefined = any free staff member.
  staffId?: string | null;
  // Token of the customer's temporary hold of this time (see lib/holds.ts).
  holdToken?: string | null;
  select?: string;
}

export type PlaceBookingResult =
  | {
      ok: true;
      booking: Record<string, unknown> | null;
      endTime: string;
      staff: { id: string; name: string } | null;
    }
  | {
      ok: false;
      code: "rules" | "too_many" | "taken" | "error";
      message: string;
    };

const TAKEN_MESSAGE = "Это время уже занято. Выберите другое.";
const STAFF_NOT_FOUND_MESSAGE = "Этот мастер не выполняет выбранную услугу или недоступен.";

// Formats "2026-08-24" as "24.08.2026".
export function formatRuDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

export type AvailabilityResult =
  | { ok: true; free: Array<StaffMember | null> }
  | { ok: false; code: "rules" | "taken"; message: string };

// Who can take a booking at this time: slot rules (working hours, closures,
// lead time) per candidate, then overlap with bookings and other customers'
// holds. Returns the free candidates in order: `null` for a business
// without staff, otherwise staff members.
export async function findFreeResources(params: {
  supabase: SupabaseClient;
  businessId: string;
  businessHours: WorkingHours | null;
  serviceId: string;
  durationMinutes: number;
  date: string;
  time: string;
  // Chosen staff member; null/undefined = any free staff member.
  staffId?: string | null;
  // The customer's own hold, which must not block them.
  holdToken?: string | null;
}): Promise<AvailabilityResult> {
  const { supabase, businessId, businessHours, durationMinutes, date, time } = params;
  const isClosedDate = Boolean(await getClosure(supabase, businessId, date));

  const allStaff = await listActiveStaff(supabase, businessId);
  const staffMode = allStaff.length > 0;

  // Who can take this booking: the business itself (no staff), the chosen
  // staff member, or every staff member performing the service.
  let candidates: Array<StaffMember | null> = [null];
  if (staffMode) {
    let qualified = staffForService(allStaff, params.serviceId);
    if (params.staffId) qualified = qualified.filter((s) => s.id === params.staffId);
    if (qualified.length === 0) {
      return { ok: false, code: "rules", message: STAFF_NOT_FOUND_MESSAGE };
    }
    candidates = qualified;
  } else if (params.staffId) {
    return { ok: false, code: "rules", message: STAFF_NOT_FOUND_MESSAGE };
  }

  // Working-hours rules per candidate (staff may have personal schedules).
  let firstRuleError: ReturnType<typeof checkSlotRules> = null;
  const fitting = candidates.filter((member) => {
    const ruleError = checkSlotRules({
      date,
      time,
      durationMinutes,
      workingHours: staffWorkingHours(member, businessHours),
      isClosedDate,
    });
    if (ruleError && !firstRuleError) firstRuleError = ruleError;
    return !ruleError;
  });
  if (fitting.length === 0) {
    return {
      ok: false,
      code: "rules",
      message: SLOT_RULE_MESSAGES[firstRuleError ?? "outside_hours"],
    };
  }

  const { data: existing } = await supabase
    .from("bookings")
    .select(
      staffMode
        ? "booking_time, staff_id, service:services!inner(duration_minutes)"
        : "booking_time, service:services!inner(duration_minutes)"
    )
    .eq("user_id", businessId)
    .eq("booking_date", date)
    .neq("status", "cancelled");
  const holds = await loadActiveHolds(supabase, businessId, date, params.holdToken);
  const rows = [...((existing ?? []) as unknown as StaffBookedRow[]), ...holds];

  const { bufferMinutes } = await loadScheduleSettings(supabase, businessId);
  const free = fitting.filter((member) => {
    const occupied = member ? rowsForStaff(rows, member.id) : rows;
    return !findOverlappingSlot(toBookedSlots(occupied), time, durationMinutes, bufferMinutes);
  });
  if (free.length === 0) {
    return { ok: false, code: "taken", message: TAKEN_MESSAGE };
  }
  return { ok: true, free };
}

// The single booking pipeline used by every channel (mini-app, mobile web,
// AI assistant): slot rules -> overlap check (bookings and other customers'
// holds) -> per-customer limit -> insert (DB constraints guard races) ->
// owner notification.
export async function placeBooking(input: PlaceBookingInput): Promise<PlaceBookingResult> {
  const { supabase, businessId, business, service, date, time, source, identity } = input;
  const durationMinutes = service.duration_minutes ?? 30;
  const businessHours = (business.working_hours ?? null) as WorkingHours | null;

  // The customer's own hold for exactly this booking (if still valid).
  const hold = await getActiveHold(supabase, input.holdToken);
  const ownHold =
    hold &&
    hold.user_id === businessId &&
    hold.service_id === service.id &&
    hold.booking_date === date &&
    sameTime(hold.booking_time, time)
      ? hold
      : null;

  const availability = await findFreeResources({
    supabase,
    businessId,
    businessHours,
    serviceId: service.id,
    durationMinutes,
    date,
    time,
    staffId: input.staffId,
    holdToken: ownHold?.token ?? null,
  });
  if (!availability.ok) return availability;

  if (identity && (await hasTooManyActiveBookings(supabase, businessId, identity))) {
    return { ok: false, code: "too_many", message: TOO_MANY_BOOKINGS_MESSAGE };
  }

  // The staff member reserved by the hold goes first.
  const free = [...availability.free].sort(
    (a, b) => Number(b?.id === ownHold?.staff_id) - Number(a?.id === ownHold?.staff_id)
  );

  // Try free candidates in order; a DB conflict (concurrent booking) moves on
  // to the next free staff member.
  let booking: Record<string, unknown> | null = null;
  let chosen: StaffMember | null = null;
  for (const member of free) {
    const { data, error } = await insertBooking(
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
        ...(member ? { staff_id: member.id } : {}),
      },
      {
        source,
        customer_messenger_id: identity?.kind === "messenger" ? identity.messengerId : null,
      },
      input.select
    );
    if (!error) {
      booking = data;
      chosen = member;
      break;
    }
    // 23505: unique start index; 23P01: bookings_no_overlap exclusion
    // constraint. Both mean a concurrent request took the slot.
    if (error.code === "23505" || error.code === "23P01") continue;
    console.error("Booking insert failed:", error);
    return {
      ok: false,
      code: "error",
      message: "Не удалось создать запись, попробуйте ещё раз.",
    };
  }
  if (!booking) {
    return { ok: false, code: "taken", message: TAKEN_MESSAGE };
  }
  if (input.holdToken) await deleteHold(supabase, input.holdToken);

  const endTime = bookingEndTime(time, durationMinutes);

  const lines = [
    "🔔 Новая запись!",
    "",
    `🛠 Услуга: ${service.title}`,
    `📅 Дата: ${formatRuDate(date)}`,
    `🕒 Время: ${time}–${endTime}`,
    ...(chosen ? [`💇 Мастер: ${chosen.name}`] : []),
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

  return {
    ok: true,
    booking,
    endTime,
    staff: chosen ? { id: chosen.id, name: chosen.name } : null,
  };
}
