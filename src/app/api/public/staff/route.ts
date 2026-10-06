import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, getDemoState } from "@/lib/demo-store";
import { listActiveStaff, staffForService } from "@/lib/staff";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  business_id: z.string().uuid(),
  service_id: z.string().uuid().nullable(),
});

// GET staff members a customer can choose (public). Optional service_id
// keeps only staff who perform that service. Only public fields are exposed.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    business_id: searchParams.get("business_id"),
    service_id: searchParams.get("service_id") || null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  const { business_id, service_id } = parsed.data;

  let staff = isSupabaseConfigured()
    ? await listActiveStaff(createAdminClient(), business_id)
    : business_id === DEMO_USER_ID
      ? getDemoState().staff.filter((s) => s.active)
      : [];
  if (service_id) staff = staffForService(staff, service_id);

  return NextResponse.json(
    staff.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      working_hours: s.working_hours,
    }))
  );
}
