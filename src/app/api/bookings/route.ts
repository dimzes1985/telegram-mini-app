import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { checkSlotRules, SLOT_RULE_MESSAGES, type WorkingHours } from "@/lib/booking-rules";
import { type CustomerIdentity } from "@/lib/booking-guard";
import { placeBooking } from "@/lib/place-booking";
import { notifyCustomerStatus } from "@/lib/notify-customer";
import { z } from "zod";
import {
  parseJsonBody,
  invalidJsonResponse,
  validationErrorResponse,
  uuidString,
  dateString,
  timeString,
} from "@/lib/http";
import { getClientIp, phoneDigits } from "@/lib/client-ip";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, getDemoState } from "@/lib/demo-store";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBookingSchema = z
  .object({
    service_id: uuidString,
    user_id: uuidString,
    booking_date: dateString,
    booking_time: timeString,
    customer_name: z.string().trim().min(1, "Имя обязательно").max(200),
    customer_phone: z.string().trim().max(50).nullable().optional(),
    customer_notes: z.string().trim().max(1000).nullable().optional(),
    initData: z.string().optional().default(""),
    platform: z.enum(["telegram", "max", "mobile"]).default("telegram"),
    // Chosen staff member; null/absent = any free staff member.
    staff_id: uuidString.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.platform !== "mobile" && !data.initData) {
      ctx.addIssue({
        code: "custom",
        message: "initData required",
        path: ["initData"],
      });
    }
    if (data.platform === "mobile" && phoneDigits(data.customer_phone).length < 10) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите номер телефона полностью",
        path: ["customer_phone"],
      });
    }
  });

const updateBookingSchema = z.object({
  id: uuidString,
  status: z.enum(["pending", "confirmed", "cancelled"]),
});

// GET all bookings for the logged-in user (admin view)
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      [...getDemoState().bookings].sort((a, b) =>
        `${b.booking_date}${b.booking_time}`.localeCompare(`${a.booking_date}${a.booking_time}`)
      )
    );
  }

  const query = (select: string) =>
    supabase
      .from("bookings")
      .select(select)
      .eq("user_id", user.id)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false });

  let { data, error } = await query("*, service:services(*), staff:staff(name)");
  // Staff table not created yet (migration-step6-staff.sql): load without it.
  if (error) ({ data, error } = await query("*, service:services(*)"));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create a new booking (public - for Telegram / MAX / mobile customers)
export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  if (!isSupabaseConfigured()) {
    const {
      service_id,
      booking_date,
      booking_time,
      customer_name,
      customer_phone,
      customer_notes,
    } = parsed.data;
    const state = getDemoState();
    const service = state.services.find((s) => s.id === service_id);
    if (!service) {
      return NextResponse.json({ error: "Услуга не найдена или недоступна" }, { status: 404 });
    }
    const ruleError = checkSlotRules({
      date: booking_date,
      time: booking_time,
      durationMinutes: service.duration_minutes ?? 30,
      workingHours: state.settings.working_hours as WorkingHours,
    });
    if (ruleError) {
      return NextResponse.json({ error: SLOT_RULE_MESSAGES[ruleError] }, { status: 400 });
    }
    const booking = {
      id: randomUUID(),
      user_id: DEMO_USER_ID,
      service_id,
      booking_date,
      booking_time,
      customer_name,
      customer_phone: customer_phone ?? null,
      customer_notes: customer_notes ?? null,
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      service,
    };
    state.bookings.unshift(booking);
    return NextResponse.json(booking, { status: 201 });
  }

  const supabase = createAdminClient();

  const {
    service_id,
    user_id,
    booking_date,
    booking_time,
    customer_name,
    customer_phone,
    customer_notes,
    initData,
    platform,
    staff_id,
  } = parsed.data;

  // Cheap per-IP limit first, before touching the database.
  const ip = getClientIp(req);
  pruneRateLimitBuckets();
  const ipLimit = await rateLimit(`bookings:ip:${ip}`, {
    windowMs: 10 * 60_000,
    max: 10,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  const { data: business } = await supabase
    .from("users")
    .select("bot_token, max_bot_token, working_hours, telegram_notify_chat_id, max_notify_user_id")
    .eq("id", user_id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Бизнес не найден" }, { status: 404 });
  }

  const isMobile = platform === "mobile";
  let identity: CustomerIdentity;
  let rateLimitKey: string;

  if (isMobile) {
    const phone = phoneDigits(customer_phone);
    identity = { kind: "phone", phoneDigits: phone };
    // Keyed by business + IP only: rotating fake phone numbers must not
    // reset the limit.
    rateLimitKey = `bookings:mobile:${user_id}:${ip}`;
  } else {
    const isMax = platform === "max";
    const botToken = isMax ? business.max_bot_token : business.bot_token;

    if (!botToken) {
      return NextResponse.json(
        { error: isMax ? "У бизнеса не подключён MAX-бот" : "У бизнеса не подключён Telegram-бот" },
        { status: 403 }
      );
    }

    const verification = isMax
      ? verifyMaxInitData(initData, botToken)
      : verifyInitData(initData, botToken);
    if (!verification.valid) {
      return NextResponse.json(
        { error: "Сессия устарела. Закройте и снова откройте приложение." },
        { status: 401 }
      );
    }

    const messengerUserId = verification.user?.id;
    if (!messengerUserId) {
      return NextResponse.json(
        { error: "Не удалось определить пользователя" },
        { status: 401 }
      );
    }

    identity = {
      kind: "messenger",
      source: isMax ? "max" : "telegram",
      messengerId: String(messengerUserId),
    };
    rateLimitKey = `bookings:${user_id}:${platform}:${messengerUserId}`;
  }

  const limit = await rateLimit(rateLimitKey, {
    windowMs: 60 * 60_000,
    max: isMobile ? 3 : 10,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток записи. Попробуйте позже." },
      { status: 429 }
    );
  }

  // Validate that the service belongs to the target business
  const { data: service } = await supabase
    .from("services")
    .select("id, title, user_id, duration_minutes, price")
    .eq("id", service_id)
    .eq("user_id", user_id)
    .eq("active", true)
    .maybeSingle();

  if (!service) {
    return NextResponse.json(
      { error: "Услуга не найдена или недоступна" },
      { status: 404 }
    );
  }

  const result = await placeBooking({
    supabase,
    businessId: user_id,
    business,
    service,
    date: booking_date,
    time: booking_time,
    customerName: customer_name,
    customerPhone: customer_phone,
    customerNotes: customer_notes,
    source: platform,
    identity,
    staffId: staff_id ?? null,
    select: "*, service:services(*)",
  });

  if (!result.ok) {
    const status = { rules: 400, too_many: 429, taken: 409, error: 500 }[result.code];
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json(
    { ...result.booking, staff: result.staff },
    { status: 201 }
  );
}

// PATCH update booking status
export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { id, status } = parsed.data;

  if (!isSupabaseConfigured()) {
    const booking = getDemoState().bookings.find((b) => b.id === id);
    if (!booking) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    booking.status = status;
    booking.updated_at = new Date().toISOString();
    return NextResponse.json(booking);
  }

  const { data: before } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!before) {
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  }

  const update: Record<string, unknown> = { status };
  if (status === "cancelled") update.cancelled_by = "owner";
  else if (before.status === "cancelled") update.cancelled_by = null;

  let result = await supabase
    .from("bookings")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, service:services(title, duration_minutes)")
    .single();

  // Database not migrated yet (no cancelled_by column): retry with status only.
  if (result.error && (result.error.code === "PGRST204" || result.error.code === "42703")) {
    result = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*, service:services(title, duration_minutes)")
      .single();
  }

  const { data, error } = result;

  if (error) {
    // Re-activating a booking (cancelled -> pending/confirmed) is checked
    // against the bookings_no_overlap exclusion constraint; a conflict means
    // the slot was taken while the booking was cancelled.
    if (error.code === "23505" || error.code === "23P01") {
      return NextResponse.json(
        { error: "Это время уже занято другой записью" },
        { status: 409 }
      );
    }
    console.error("Booking status update failed:", error);
    return NextResponse.json({ error: "Не удалось изменить статус" }, { status: 500 });
  }

  // Tell the customer (Telegram / MAX) about confirmation or cancellation.
  let customer_notified = false;
  if (before.status !== status && (status === "confirmed" || status === "cancelled")) {
    customer_notified = await notifyCustomerStatus(createAdminClient(), user.id, data, status);
  }

  return NextResponse.json({ ...data, customer_notified });
}
