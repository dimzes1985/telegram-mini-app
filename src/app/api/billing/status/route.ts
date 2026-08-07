import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage } from "@/lib/ai-usage";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/status - current plan, subscription and usage
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Current plan
  const { data: userData } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();

  const currentPlan = userData?.plan || "free";

  // Subscription (if any)
  let subscription = null;
  try {
    const { data: subData } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    subscription = subData;
  } catch {
    // table may not exist
  }

  // AI usage
  let usage = null;
  try {
    usage = await getAiUsage(admin, user.id);
  } catch {
    usage = null;
  }

  const availablePlans = Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    price_monthly_rub: p.priceMonthlyRub,
    ai_messages_per_month: p.aiMessagesPerMonth,
    max_services: p.maxServices === Infinity ? null : p.maxServices,
    custom_branding: p.customBranding,
  }));

  return NextResponse.json({
    current_plan: currentPlan,
    subscription,
    usage,
    available_plans: availablePlans,
  });
}
