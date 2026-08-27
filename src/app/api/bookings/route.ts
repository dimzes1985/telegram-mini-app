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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBookingSchema = z.object({
  service_id: uuidString,
  user_id: uuidString,
  booking_date: dateString,
  booking_time: timeString,
  customer_name: z.string().trim().min(1, "Имя обязательно").max(200),
  customer_phone: z.string().trim().max(50).nullable().optional(),
  customer_notes: z.string().trim().max(1000).nullable().optional(),
  initData: z.string().min(1, "initData required"),
  platform: z.enum(["telegram", "max"]).default("telegram"),
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
// Non-blocking: a failed notification must not fail the booking.
function notifyBookingOwner(input: BookingNotificationInput): void {
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

  notifyOwner(business, lines.join("\n"));
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
  const supabase = createAdminClient();

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

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

  if (!initData) {
    return NextResponse.json(
      { error: "initData required" },
      { status: 401 }
    );
  }

  // Load the business bot token(s) to verify the caller
  const { data: business } = await supabase
    .from("users")
    .select("bot_token, max_bot_token, working_hours, telegram_notify_chat_id, max_notify_user_id")
    .eq("id", user_id)
    .single();

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

  // Rate limit booking attempts per user + business
  pruneRateLimitBuckets();
  const limit = await rateLimit(`bookings:${user_id}:${messengerUserId}`, {
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

  // Notify the owner (non-blocking; a notification failure must not fail the booking)
  if (data && business) {
    notifyBookingOwner({
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
