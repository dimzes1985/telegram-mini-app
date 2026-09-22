import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, getDemoState } from "@/lib/demo-store";

// GET all active services for a business (public - for Telegram customers)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");

  if (!businessId) {
    return NextResponse.json(
      { error: "business_id required" },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    if (businessId !== DEMO_USER_ID) {
      return NextResponse.json([]);
    }
    return NextResponse.json(
      getDemoState().services.filter((s) => s.active).map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        price: s.price,
        duration_minutes: s.duration_minutes,
      }))
    );
  }

  const supabase = await createClient();
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
