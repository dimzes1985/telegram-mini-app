import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { demoTimeSlots } from "@/lib/demo-slots";
import { computeTimeSlots } from "@/lib/available-slots";
import { type WorkingHours } from "@/lib/booking-rules";

const timeslotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)"),
  service_id: z.string().min(1),
  business_id: z.string().min(1),
});

// GET available time slots for a specific date and service
export async function GET(req: Request) {
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

  if (!isSupabaseConfigured()) {
    const slots = demoTimeSlots(date, service_id);
    if (slots === null) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    return NextResponse.json(slots);
  }

  const supabase = createAdminClient();

  // Get service duration
  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes, user_id")
    .eq("id", service_id)
    .maybeSingle();

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

  const { data: user } = await supabase
    .from("users")
    .select("working_hours")
    .eq("id", business_id)
    .maybeSingle();

  const slots = await computeTimeSlots(supabase, {
    businessId: business_id,
    date,
    durationMinutes,
    workingHours: user?.working_hours as WorkingHours | null,
  });

  return NextResponse.json(slots);
}
