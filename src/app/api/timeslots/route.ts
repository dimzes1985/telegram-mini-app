import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOverlappingSlot,
  minutesToTime,
  toBookedSlots,
} from "@/lib/slot";
import { z } from "zod";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

const timeslotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)"),
  service_id: z.string().min(1),
  business_id: z.string().min(1),
});

// GET available time slots for a specific date and service
export async function GET(req: Request) {
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const parsed = timeslotsQuerySchema.safeParse({
    date: searchParams.get("date"),
    service_id: searchParams.get("service_id"),
    business_id: searchParams.get("business_id"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Date, service_id, and business_id required" },
      { status: 400 }
    );
  }

  const { date, service_id, business_id } = parsed.data;

  // Get service duration
  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes, user_id")
    .eq("id", service_id)
    .single();

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (service.user_id !== business_id) {
    return NextResponse.json(
      { error: "Service does not belong to this business" },
      { status: 403 }
    );
  }

  const durationMinutes = service.duration_minutes ?? 30;

  // Get business working hours
  const { data: user } = await supabase
    .from("users")
    .select("working_hours")
    .eq("id", business_id)
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

  // Get existing bookings for this date, with each service's duration so we
  // can tell whether a proposed slot overlaps an already booked interval.
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("booking_time, service:services!inner(duration_minutes)")
    .eq("user_id", business_id)
    .eq("booking_date", date)
    .neq("status", "cancelled");

  const bookedSlots = toBookedSlots(existingBookings);

  // Generate time slots within working hours. The grid steps by the service
  // duration so a slot's interval never overlaps the next slot of the same
  // service, and every slot fits entirely inside the work day.
  const slots = [];
  const isToday = dateObj.toDateString() === new Date().toDateString();
  const step = Math.max(15, durationMinutes);
  for (
    let minutes = startMinutes;
    minutes + durationMinutes <= endMinutes;
    minutes += step
  ) {
    const time = minutesToTime(minutes);
    if (isToday) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < nowMinutes) {
        continue;
      }
    }
    slots.push({
      time,
      available: !findOverlappingSlot(bookedSlots, time, durationMinutes),
    });
  }

  return NextResponse.json(slots);
}
