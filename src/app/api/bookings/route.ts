import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { notifyOwner } from "@/lib/notify-owner";
import {
  bookingEndTime,
  findOverlappingSlot,
  timeToMinutes,
  toBookedSlots,
} from "@/lib/slot";
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
        message: "Укажите телефон",
        path: ["customer_phone"],
      });
    }
  });

const updateBookingSchema = z.object({
  id: uuidString,
  status: z.enum(["pending", "confirmed", "cancelled"]),
});

interface BookingNotificationInput {
  business: {
    bot_token?: string | null;
    max_bot_token?: string | null;
    telegram_notify_chat_id?: string | null;
    max_notify_user_id?: string | null;
  };
  serviceTitle: string;
  bookingDate: string;
  bookingTime: string;
  customerName: string;
  customerPhone?: string | null;
  customerNotes?: string | null;
}

// Builds the new-booking message and sends it to the owner's channels.
// The notification is awaited so it is delivered before the request ends:
// on serverless runtimes fire-and-forget HTTP calls are dropped otherwise.
// A failed notification must not fail the booking (notifyOwner never rejects).
async function notifyBookingOwner(input: BookingNotificationInput): Promise<void> {
  const {
    business,
    serviceTitle,
    bookingDate,
    bookingTime,
    customerName,
    customerPhone,
    customerNotes,
  } = input;

  const lines = [
    "🔔 Новая запись!",
    "",
    `🛠 Услуга: ${serviceTitle}`,
    `📅 Дата: ${bookingDate}`,
    `🕒 Время: ${bookingTime}`,
    `👤 Клиент: ${customerName}`,
    `📞 Телефон: ${customerPhone || "не указан"}`,
  ];
  if (customerNotes) {
    lines.push(`📝 Комментарий: ${customerNotes}`);
  }

  await notifyOwner(business, lines.join("\n"));
}

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

  const { data, error } = await supabase
    .from("bookings")
    .select("*, service:services(*)")
    .eq("user_id", user.id)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create a new booking (public - for Telegram customers)
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
      return NextResponse.json({ error: "Service not found or not available" }, { status: 404 });
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
  } = parsed.data;

  const { data: business } = await supabase
    .from("users")
    .select("bot_token, max_bot_token, working_hours, telegram_notify_chat_id, max_notify_user_id")
    .eq("id", user_id)
    .single();

  const isMobile = platform === "mobile";
  let rateLimitKey = "";

  if (isMobile) {
    const phone = phoneDigits(customer_phone);
    const ip = getClientIp(req);
    rateLimitKey = `bookings:mobile:${user_id}:${phone}:${ip}`;
  } else {
    if (!initData) {
      return NextResponse.json(
        { error: "initData required" },
        { status: 401 }
      );
    }

    const isMax = platform === "max";
    const botToken = isMax ? business?.max_bot_token : business?.bot_token;

    if (!botToken) {
      return NextResponse.json(
        { error: isMax ? "Business has no MAX bot configured" : "Business has no bot configured" },
        { status: 403 }
      );
    }

    const verification = isMax
      ? verifyMaxInitData(initData, botToken)
      : verifyInitData(initData, botToken);
    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || "Invalid initData" },
        { status: 401 }
      );
    }

    const messengerUserId = verification.user?.id;
    if (!messengerUserId) {
      return NextResponse.json(
        { error: "Could not identify user" },
        { status: 401 }
      );
    }

    rateLimitKey = `bookings:${user_id}:${messengerUserId}`;
  }

  pruneRateLimitBuckets();
  const limit = await rateLimit(rateLimitKey, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts, please slow down" },
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
    .single();

  if (!service) {
    return NextResponse.json(
      { error: "Service not found or not available" },
      { status: 404 }
    );
  }

  const durationMinutes = service.duration_minutes ?? 30;
  const startMinutes = timeToMinutes(booking_time);
  if (startMinutes === null) {
    return NextResponse.json(
      { error: "Invalid time format" },
      { status: 400 }
    );
  }
  const endTime = bookingEndTime(booking_time, durationMinutes);

  // Validate the requested time fits within the business working hours,
  // including the full service duration (start and end inside the work day).
  if (business?.working_hours) {
    const dateObj = new Date(booking_date + "T00:00:00");
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const dayName = dayNames[dateObj.getDay()];
    const dayHours = (business.working_hours as Record<string, { start: string; end: string; enabled: boolean }>)[dayName];

    if (!dayHours?.enabled) {
      return NextResponse.json(
        { error: "Business is closed on this day" },
        { status: 400 }
      );
    }

    const dayStart = timeToMinutes(dayHours.start);
    const dayEnd = timeToMinutes(dayHours.end);
    if (
      dayStart === null ||
      dayEnd === null ||
      startMinutes < dayStart ||
      startMinutes + durationMinutes > dayEnd
    ) {
      return NextResponse.json(
        { error: "Requested time is outside working hours" },
        { status: 400 }
      );
    }
  }

  // Check for bookings that overlap the requested interval. A service takes
  // `duration_minutes`, so a booking blocks the whole [start, start+duration)
  // window, not just its starting minute.
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", user_id)
    .eq("booking_date", booking_date)
    .neq("status", "cancelled");

  const existingSlots = toBookedSlots(existingBookings);

  if (findOverlappingSlot(existingSlots, booking_time, durationMinutes)) {
    return NextResponse.json(
      { error: "This time slot is already booked" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      service_id,
      user_id,
      booking_date,
      booking_time,
      customer_name,
      customer_phone,
      customer_notes,
      status: "pending",
    })
    .select("*, service:services(*)")
    .single();

  if (error) {
    // The unique index on (user_id, booking_date, booking_time) and the
    // overlap trigger both guard the race between the conflict check and the
    // insert (23505 exact start, 23P01 overlapping interval).
    if (error.code === "23505" || error.code === "23P01") {
      return NextResponse.json(
        { error: "This time slot is already booked" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the owner (awaited for delivery; notifyOwner never rejects, so a
  // failed notification cannot fail the booking)
  if (data && business) {
    await notifyBookingOwner({
      business,
      serviceTitle: service.title,
      bookingDate: booking_date,
      bookingTime: `${booking_time}–${endTime}`,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerNotes: customer_notes,
    });
  }

  return NextResponse.json(data, { status: 201 });
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

  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
