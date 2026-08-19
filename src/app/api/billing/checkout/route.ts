import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS, type Plan } from "@/lib/plans";
import { createYookassaPayment, isYookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { plan } = await req.json();
  const planConfig = PLANS[plan as Plan];

  if (!planConfig || plan === "free") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const returnUrl = `${baseUrl}/admin/billing?status=checkout`;

  try {
    const payment = await createYookassaPayment({
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
