import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, getDemoState } from "@/lib/demo-store";

// GET public business info (working hours) for the booking mini-app
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    if (businessId !== DEMO_USER_ID) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    const s = getDemoState().settings;
    return NextResponse.json({
      id: s.id,
      business_name: s.business_name,
      business_description: s.business_description,
      business_address: s.business_address,
      business_phone: s.business_phone,
      business_email: s.business_email,
      working_hours: s.working_hours,
    });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, business_name, business_description, business_address, business_phone, business_email, working_hours"
    )
    .eq("id", businessId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
