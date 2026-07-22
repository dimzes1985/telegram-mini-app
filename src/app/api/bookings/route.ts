import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  const body = await req.json();
  const {
    service_id,
    user_id,
    booking_date,
    booking_time,
    customer_name,
    customer_phone,
    customer_notes,
  } = body;

  if (!service_id || !user_id || !booking_date || !booking_time || !customer_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
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
