import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type Plan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface YookassaNotification {
  event: string;
  object: {
    id: string;
    status: string;
    amount: { value: string; currency: string };
    payment_method?: { id: string; saved?: boolean };
    metadata?: Record<string, string>;
  };
}

// POST /api/billing/webhook - ЮKassa payment notification
export async function POST(req: Request) {
  const notification = (await req.json()) as YookassaNotification;
  const admin = createAdminClient();

  const metadata = notification.object?.metadata || {};

  // Only handle subscription payments we created
  if (metadata.type !== "subscription_first" && metadata.type !== "subscription_renewal") {
    return NextResponse.json({ ok: true });
  }

  const userId = metadata.user_id;
  const plan = metadata.plan as Plan;

  if (!userId || !PLANS[plan]) {
    return NextResponse.json({ ok: true });
  }

  const paymentId = notification.object?.id;

  if (notification.event === "payment.succeeded") {
    const paymentMethodId = notification.object?.payment_method?.id;

    // Record the payment
    await admin.from("payments").upsert(
      {
        user_id: userId,
        yookassa_payment_id: paymentId,
        amount: Number(notification.object?.amount?.value || 0),
        currency: notification.object?.amount?.currency || "RUB",
        status: "succeeded",
      },
      { onConflict: "yookassa_payment_id" }
    );

    // Upsert subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        plan,
        status: "active",
        yookassa_payment_id: paymentId,
        yookassa_payment_method_id: paymentMethodId || null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Upgrade the user plan (harmless on renewals)
    await admin
      .from("users")
      .update({ plan })
      .eq("id", userId);
  }

  if (notification.event === "payment.canceled") {
    await admin
      .from("payments")
      .update({ status: "canceled" })
      .eq("yookassa_payment_id", paymentId);
  }

  return NextResponse.json({ ok: true });
}
