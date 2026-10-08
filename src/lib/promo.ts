import type { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, type Plan } from "@/lib/plans";

export interface PromoCode {
  code: string;
  kind: "trial" | "price";
  plan: Exclude<Plan, "free">;
  trial_days: number | null;
  price_rub: number | null;
}

// "start 30 " -> "START30"
export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  already_used: "Вы уже использовали этот промокод.",
  invalid_code: "Промокод не найден, закончился или больше не действует.",
};

export function promoErrorMessage(dbMessage: string | undefined): string {
  for (const [key, text] of Object.entries(DB_ERROR_MESSAGES)) {
    if (dbMessage?.includes(key)) return text;
  }
  return "Не удалось применить промокод. Попробуйте позже.";
}

// Special monthly price from a redeemed "price" promo code for this plan, or
// null when the user pays the regular price.
export async function getPromoPrice(
  admin: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<number | null> {
  try {
    const { data } = await admin
      .from("promo_redemptions")
      .select("price_rub")
      .eq("user_id", userId)
      .eq("kind", "price")
      .eq("plan", plan)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const price = Number(data?.price_rub);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// Monthly price the user pays for a plan (promo price or the list price).
export async function effectivePlanPrice(
  admin: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<number> {
  return (await getPromoPrice(admin, userId, plan)) ?? PLANS[plan].priceMonthlyRub;
}

// Start of the first paid period: a running free trial is not cut short.
export function firstPeriodStart(
  existing: { status?: string | null; current_period_end?: string | null } | null | undefined,
  now: Date = new Date()
): Date {
  if (existing?.status === "trialing" && existing.current_period_end) {
    const trialEnd = new Date(existing.current_period_end);
    if (trialEnd.getTime() > now.getTime()) return trialEnd;
  }
  return now;
}
