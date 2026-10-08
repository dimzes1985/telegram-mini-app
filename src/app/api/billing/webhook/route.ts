import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type Plan } from "@/lib/plans";
import {
  getYookassaPayment,
  isYookassaConfigured,
  isYookassaWebhookIp,
} from "@/lib/yookassa";
import { firstPeriodStart } from "@/lib/promo";
import { loadOwnerNotifyTargets, notifyOwner } from "@/lib/notify-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Set to "1" only for local testing (never in production) to skip the
// source-IP allowlist check. Payment verification via the ЮKassa API always
// stays on.
const ALLOW_IP_BYPASS = process.env.YOOKASSA_ALLOW_IP_BYPASS === "1";

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

// Extract the real client IP. On Vercel the trusted value is
// x-vercel-forwarded-for; otherwise take the last hop of x-forwarded-for
// (appended by the edge, not user-controlled), then fall back to x-real-ip.
function getClientIp(req: Request): string | null {
  const vercelForwarded = req.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) return vercelForwarded.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").pop()?.trim();
    if (last) return last;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const ip = (req as unknown as { ip?: string }).ip;
  return ip || null;
}

// POST /api/billing/webhook - ЮKassa payment notification
export async function POST(req: Request) {
  // The webhook is only meaningful when our shop keys are set (and they are
  // needed to verify payments), so treat an unconfigured shop as an error.
  if (!isYookassaConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 }
    );
  }

  // 1) Reject callers outside the ЮKassa notification IP ranges.
  if (!ALLOW_IP_BYPASS) {
    const ip = getClientIp(req);
    if (ip && !isYookassaWebhookIp(ip)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  let notification: YookassaNotification;
  try {
    notification = (await req.json()) as YookassaNotification;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const metadata = notification.object?.metadata || {};

  // Only handle subscription payments we created
  if (metadata.type !== "subscription_first" && metadata.type !== "subscription_renewal") {
    return NextResponse.json({ ok: true });
  }

  const userId = metadata.user_id;
  const plan = metadata.plan as Plan;
  const paymentId = notification.object?.id;

  if (!userId || !PLANS[plan] || !paymentId) {
    return NextResponse.json({ ok: true });
  }

  // 2) Verify the notification against the ЮKassa API. Any caller can claim an
  // arbitrary payment id, so confirm the payment actually exists, has the
  // expected status, and carries the same metadata we set when creating it.
  let payment;
  try {
    payment = await getYookassaPayment(paymentId);
  } catch {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const paymentMetadata = payment.metadata || {};
  const expectedStatus = notification.event.replace("payment.", "");
  // For successful payments also make sure the full plan price was paid in
  // RUB (the amount is taken from the ЮKassa API, not from the request body).
  const paidAmount = Number(payment.amount?.value ?? NaN);
  // Promo prices are stored in the payment metadata by our server (the
  // metadata comes from the ЮKassa API, so it cannot be forged by the caller).
  const metaAmount = Number(paymentMetadata.amount);
  const expectedAmount =
    Number.isFinite(metaAmount) && metaAmount > 0 ? metaAmount : PLANS[plan].priceMonthlyRub;
  const amountOk =
    expectedStatus !== "succeeded" ||
    (payment.amount?.currency === "RUB" &&
      Math.abs(paidAmount - expectedAmount) < 0.01);
  const verified =
    payment.status === expectedStatus &&
    paymentMetadata.type === metadata.type &&
    paymentMetadata.user_id === userId &&
    paymentMetadata.plan === plan &&
    amountOk;

  if (!verified) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const admin = createAdminClient();

  if (notification.event === "payment.succeeded") {
    // Idempotency guard #1: ЮKassa delivers notifications at-least-once, so the
    // same payment can arrive several times. If it is already recorded as
    // succeeded, acknowledge and skip all side effects (otherwise a renewal
    // would extend the period again).
    const { data: processedPayment } = await admin
      .from("payments")
      .select("id")
      .eq("yookassa_payment_id", paymentId)
      .eq("status", "succeeded")
      .maybeSingle();

    if (processedPayment) {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    // Only use the payment method for future recurring charges if YooKassa
    // actually saved it (save_payment_method). For one-time fallback payments
    // the method must be ignored, otherwise the renewal cron would try to
    // charge an unsaved method.
    const savedMethod = payment.payment_method?.saved === true;
    const paymentMethodId = savedMethod ? payment.payment_method?.id ?? null : null;

    // Extend the period from the current period end (if any) instead of "now",
    // so a delayed webhook never shortens or drifts the subscription period.
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select(
        "id, status, current_period_end, yookassa_payment_method_id, yookassa_payment_id"
      )
      .eq("user_id", userId)
      .maybeSingle();

    // If this payment did not save a payment method (e.g. the one-time
    // fallback path), keep the method previously saved on the subscription so
    // an upgrade does not silently break recurring renewals.
    const effectivePaymentMethodId =
      paymentMethodId ??
      existingSub?.yookassa_payment_method_id ??
      null;

    // Idempotency guard #2: the subscription already points at this payment, so
    // its period has already been extended. Do not extend it twice, but still
    // reconcile the payment ledger and the user plan below.
    const alreadyExtended = existingSub?.yookassa_payment_id === paymentId;

    let subscriptionId = existingSub?.id ?? null;

    if (!alreadyExtended) {
      const now = new Date();
      const periodStart =
        metadata.type === "subscription_renewal" && existingSub?.current_period_end
          ? new Date(existingSub.current_period_end)
          : firstPeriodStart(existingSub, now);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Upsert subscription and get its id so payments can be linked to it
      const { data: subscription } = await admin
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            plan,
            status: "active",
            yookassa_payment_id: paymentId,
            yookassa_payment_method_id: effectivePaymentMethodId,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            cancel_at_period_end: false,
            updated_at: now.toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select("id")
        .single();

      subscriptionId = subscription?.id ?? subscriptionId;
    }

    // Record the payment, linked to the subscription
    await admin.from("payments").upsert(
      {
        user_id: userId,
        subscription_id: subscriptionId,
        yookassa_payment_id: paymentId,
        amount: paidAmount,
        currency: payment.amount?.currency || "RUB",
        status: "succeeded",
      },
      { onConflict: "yookassa_payment_id" }
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

    // A canceled renewal means the recurring charge failed: mark the
    // subscription past_due so the owner can react before losing access.
    if (metadata.type === "subscription_renewal") {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();

      await admin
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // Idempotency: only alert the owner on the first transition to past_due,
      // so repeated deliveries of the same notification do not spam them.
      if (sub?.status !== "past_due") {
        const targets = await loadOwnerNotifyTargets(admin, userId);
        await notifyOwner(
          targets,
          `⚠️ Не удалось автоматически продлить тариф ${PLANS[plan].name}. Проверьте способ оплаты в разделе «Тарифы», чтобы не потерять доступ.`
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
