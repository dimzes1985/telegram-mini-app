import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type Plan } from "@/lib/plans";
import { createYookassaPayment, isYookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/renew-subscriptions
// Call this endpoint periodically (e.g. daily) to charge active subscriptions
// whose period has ended. Accepts requests from Vercel Cron (identified by the
// x-vercel-cron-schedule header) or external schedulers using a Bearer CRON_SECRET.
export async function POST(req: Request) {
  const isVercelCron = req.headers.has("x-vercel-cron-schedule");

  if (!isVercelCron) {
    if (!CRON_SECRET) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isYookassaConfigured()) {
    return NextResponse.json({ error: "ЮKassa not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .lte("current_period_end", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ user_id: string; status: string; detail?: string }> = [];

  for (const sub of subs || []) {
    if (!sub.yookassa_payment_method_id) {
      results.push({ user_id: sub.user_id, status: "skipped", detail: "no saved payment method" });
      continue;
    }

    const plan = sub.plan as Plan;
    const price = PLANS[plan]?.priceMonthlyRub;

    if (!price) {
      results.push({ user_id: sub.user_id, status: "skipped", detail: "unknown plan" });
      continue;
    }

    try {
      await createYookassaPayment({
        amount: price,
        description: `Подписка ${PLANS[plan].name} (продление)`,
        returnUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim(),
        savePaymentMethod: true,
        paymentMethodId: sub.yookassa_payment_method_id,
        metadata: {
          user_id: sub.user_id,
          plan,
          type: "subscription_renewal",
        },
      });
      results.push({ user_id: sub.user_id, status: "renewal_initiated" });
    } catch (e) {
      results.push({
        user_id: sub.user_id,
        status: "error",
        detail: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
