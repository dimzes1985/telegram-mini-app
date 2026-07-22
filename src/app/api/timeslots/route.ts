import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

// GET available time slots for a specific date and service
export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const serviceId = searchParams.get("service_id");
  const businessId = searchParams.get("business_id");

  if (!date || !serviceId || !businessId) {
    return NextResponse.json(
      { error: "Date, service_id, and business_id required" },
      { status: 400 }
    );
  }

  // Get service duration
  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Get business working hours
  const { data: user } = await supabase
    .from("users")
    .select("working_hours")
    .eq("id", businessId)
    .single();

  // Get day of week from date (0 = Sunday, 1 = Monday, etc.)
  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[dayOfWeek];

  const workingHours = user?.working_hours as Record<string, WorkingHoursDay> | null;
  const todayHours = workingHours?.[dayName];

  // If day is disabled or no working hours configured, return empty
  if (!todayHours || !todayHours.enabled) {
    return NextResponse.json([]);
  }

  // Parse working hours start/end
  const [startHour, startMin] = todayHours.start.split(":").map(Number);
  const [endHour, endMin] = todayHours.end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Get existing bookings for this date
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("booking_time")
    .eq("user_id", businessId)
    .eq("booking_date", date)
    .neq("status", "cancelled");

  const bookedTimes = new Set(
    existingBookings?.map((b) => b.booking_time.substring(0, 5)) || []
  );

  // Generate time slots based on working hours
  const slots = [];
  for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
    const hour = Math.floor(minutes / 60);
    const min = minutes % 60;
    const time = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
    slots.push({
      time,
      available: !bookedTimes.has(time),
    });
  }

  return NextResponse.json(slots);
}
