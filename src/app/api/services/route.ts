import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan, PLANS } from "@/lib/plans";

// GET all services for the logged-in user
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create a new service
export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, price, duration_minutes } = body;

  if (!title || !price) {
    return NextResponse.json(
      { error: "Title and price are required" },
      { status: 400 }
    );
  }

  // Enforce plan service limit
  const { data: userData } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = getPlan(userData?.plan);
  const maxServices = PLANS[plan].maxServices;

  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count !== null && count >= maxServices) {
    return NextResponse.json(
      {
        error: `Your ${plan} plan allows up to ${maxServices === Infinity ? "unlimited" : maxServices} services. Upgrade to add more.`,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      user_id: user.id,
      title,
      description,
      price,
      duration_minutes: duration_minutes || 30,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE a service
export async function DELETE(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Service ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
