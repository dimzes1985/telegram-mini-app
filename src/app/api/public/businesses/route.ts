import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, listDemoBusinesses } from "@/lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const id = (searchParams.get("id") || "").trim();

  if (!id && q.length < 2) {
    return NextResponse.json(
      { error: "Укажите id или поисковый запрос (минимум 2 символа)" },
      { status: 400 }
    );
  }

  pruneRateLimitBuckets();
  const limit = await rateLimit(`public-businesses:${getClientIp(req)}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isSupabaseConfigured()) {
    if (id) {
      return NextResponse.json(id === DEMO_USER_ID ? listDemoBusinesses() : []);
    }
    return NextResponse.json(listDemoBusinesses(q));
  }

  const supabase = createAdminClient();

  if (id) {
    const { data, error } = await supabase
      .from("users")
      .select(
        "id, business_name, business_description, business_address, business_phone, working_hours"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ? [data] : []);
  }

  const safeQuery = q.replace(/[%_]/g, " ").slice(0, 80);
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, business_name, business_description, business_address, business_phone, working_hours"
    )
    .ilike("business_name", `%${safeQuery}%`)
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
