import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rateLimit } from "@/lib/rate-limit";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { normalizePromoCode, promoErrorMessage, type PromoCode } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(2).max(40) });

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

// POST /api/billing/promo {code}: applies a promo code to the business.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "В демо-режиме промокоды недоступны." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите промокод" }, { status: 400 });
  }
  const code = normalizePromoCode(parsed.data.code);

  // Guessing codes must be slow.
  const limit = await rateLimit(`promo:${user.id}`, { windowMs: 60 * 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: promo } = await admin
    .from("promo_codes")
    .select("code, kind, plan, trial_days, price_rub")
    .eq("code", code)
    .maybeSingle();
  if (!promo) {
    return NextResponse.json({ error: promoErrorMessage("invalid_code") }, { status: 404 });
  }
  const p = promo as PromoCode;

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (p.kind === "trial") {
    // A free period is only for businesses that never had a subscription.
    if (sub) {
      return NextResponse.json(
        {
          error: isSubscriptionEntitled(sub as SubscriptionRow)
            ? "У вас уже действует платный тариф — бесплатный период не нужен."
            : "Бесплатный период доступен только новым пользователям.",
        },
        { status: 400 }
      );
    }
  }

  const { error: redeemError } = await admin.rpc("redeem_promo_code", {
    p_code: code,
    p_user: user.id,
  });
  if (redeemError) {
    return NextResponse.json({ error: promoErrorMessage(redeemError.message) }, { status: 400 });
  }

  const planName = PLANS[p.plan].name;

  if (p.kind === "trial") {
    const now = new Date();
    const end = new Date(now.getTime() + (p.trial_days ?? 30) * 24 * 60 * 60 * 1000);
    await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        plan: p.plan,
        status: "trialing",
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        // Ends by itself unless the business pays.
        cancel_at_period_end: true,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );
    await admin.from("users").update({ plan: p.plan }).eq("id", user.id);
    return NextResponse.json({
      ok: true,
      message: `Готово! Тариф ${planName} бесплатно до ${end.toLocaleDateString("ru-RU")}. Карта не нужна.`,
    });
  }

  return NextResponse.json({
    ok: true,
    message: `Готово! Для вас тариф ${planName} стоит ${rub(p.price_rub ?? 0)} в месяц — цена сохранится при продлении.`,
  });
}
