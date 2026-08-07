import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const body = await req.json();
  const {
    service_id,
    user_id,
    booking_date,
    booking_time,
    customer_name,
    customer_phone,
    customer_notes,
    initData,
  } = body;

  if (!service_id || !user_id || !booking_date || !booking_time || !customer_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (!initData) {
    return NextResponse.json(
      { error: "Telegram initData required" },
      { status: 401 }
    );
  }

  // Load the business bot token to verify the caller
  const { data: business } = await supabase
    .from("users")
    .select("bot_token, working_hours")
    .eq("id", user_id)
    .single();

  if (!business?.bot_token) {
    return NextResponse.json(
      { error: "Business has no bot configured" },
      { status: 403 }
    );
  }

  const verification = verifyInitData(initData, business.bot_token);
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error || "Invalid initData" },
      { status: 401 }
    );
  }

  const telegramUserId = verification.user?.id;
  if (!telegramUserId) {
    return NextResponse.json(
      { error: "Could not identify Telegram user" },
      { status: 401 }
    );
  }

  // Rate limit booking attempts per user + business
  pruneRateLimitBuckets();
  const limit = rateLimit(`bookings:${user_id}:${telegramUserId}`, {
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

  // Check for conflicting bookings
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", user_id)
    .eq("booking_date", booking_date)
    .eq("booking_time", booking_time)
    .neq("status", "cancelled");

  if (existingBookings && existingBookings.length > 0) {
    return NextResponse.json(
      { error: "This time slot is already booked" },
      { status: 409 }
    );
  }

  // Validate the requested time is within the business working hours
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

    if (booking_time < dayHours.start || booking_time > dayHours.end) {
      return NextResponse.json(
        { error: "Requested time is outside working hours" },
        { status: 400 }
      );
    }
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const body = await req.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json(
      { error: "Booking ID and status required" },
      { status: 400 }
    );
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
