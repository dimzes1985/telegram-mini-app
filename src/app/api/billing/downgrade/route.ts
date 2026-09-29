import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/downgrade - drop the user to the free plan.
// If the paid period is still running the downgrade is scheduled for the end
// of the period (cancel_at_period_end). Otherwise it is applied immediately.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "В демо-режиме подписка не активна" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    // No subscription: nothing to cancel, make sure the plan is free.
    await admin.from("users").update({ plan: "free" }).eq("id", user.id);
    return NextResponse.json({ plan: "free", downgraded: true });
  }

  const subscription = sub as SubscriptionRow;

  // The paid period is still running: schedule the downgrade at its end so the
  // user keeps the paid features they already paid for.
  if (isSubscriptionEntitled(subscription, now)) {
    await admin
      .from("subscriptions")
      .update({ cancel_at_period_end: true, updated_at: now.toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({
      plan: getPlan(subscription.plan),
      scheduled: true,
      current_period_end: subscription.current_period_end,
    });
  }

  // The period is already over: apply the downgrade immediately.
  await admin
    .from("subscriptions")
    .update({ status: "cancelled", updated_at: now.toISOString() })
    .eq("user_id", user.id);
  await admin.from("users").update({ plan: "free" }).eq("id", user.id);

  return NextResponse.json({ plan: "free", downgraded: true });
}
