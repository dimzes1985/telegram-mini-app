import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET all active services for a business (public - for Telegram customers)
export async function GET(req: Request) {
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json(
      { error: "business_id required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("services")
    .select("id, title, description, price, duration_minutes")
    .eq("user_id", businessId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
