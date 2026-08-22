import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS, type Plan } from "@/lib/plans";
import { createYookassaPayment, isYookassaConfigured } from "@/lib/yookassa";
import { z } from "zod";
import {
  parseJsonBody,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
});

// POST /api/billing/checkout - create a payment for upgrading the plan
export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isYookassaConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY." },
      { status: 503 }
    );
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { plan } = parsed.data;
  const planConfig = PLANS[plan as Plan];

  if (!planConfig) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const returnUrl = `${baseUrl}/admin/billing?status=checkout`;

  const isRecurringNotAllowed = (e: unknown) =>
    e instanceof Error &&
    e.message.includes("403") &&
    /recurring/i.test(e.message);

  try {
    let payment;
    try {
      // Try to create a subscription payment with the payment method saved for
      // future recurring charges (requires autopayments enabled in YooKassa).
      payment = await createYookassaPayment({
        amount: planConfig.priceMonthlyRub,
        description: `Подписка ${planConfig.name} (${user.email || "business"})`,
        returnUrl,
        savePaymentMethod: true,
        metadata: {
          user_id: user.id,
          plan,
          type: "subscription_first",
        },
      });
    } catch (e) {
      // If the store can't do recurring payments yet, fall back to a regular
      // one-time payment so the first purchase still works.
      if (isRecurringNotAllowed(e)) {
        payment = await createYookassaPayment({
          amount: planConfig.priceMonthlyRub,
          description: `Подписка ${planConfig.name} (${user.email || "business"})`,
          returnUrl,
          savePaymentMethod: false,
          metadata: {
            user_id: user.id,
            plan,
            type: "subscription_first",
          },
        });
      } else {
        throw e;
      }
    }

    return NextResponse.json({
      payment_id: payment.id,
      confirmation_url: payment.confirmation?.confirmation_url,
    });
  } catch (e) {
    console.error("YooKassa checkout failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка создания платежа" },
      { status: 502 }
    );
  }
}
