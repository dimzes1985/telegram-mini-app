import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET public business info (working hours) for the booking mini-app
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("business_name, working_hours")
    .eq("id", businessId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
