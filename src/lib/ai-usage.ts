import { SupabaseClient } from "@supabase/supabase-js";
import { getPlan, currentYearMonth, PLANS } from "@/lib/plans";

export interface AiUsageInfo {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
}

function limitFor(plan: string): number {
  const p = PLANS[plan as keyof typeof PLANS];
  return p ? p.aiMessagesPerMonth : PLANS.free.aiMessagesPerMonth;
}

// Returns the plan limit and current usage for a business.
export async function getAiUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<AiUsageInfo> {
  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", userId)
    .single();

  const plan = getPlan(user?.plan);
  const limit = limitFor(plan);

  const yearMonth = currentYearMonth();
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("messages_count")
    .eq("user_id", userId)
    .eq("year_month", yearMonth)
    .single();

  const used = usage?.messages_count ?? 0;

  return { plan, used, limit, remaining: Math.max(0, limit - used) };
}

// Atomically increments the monthly message counter.
export async function incrementAiUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const yearMonth = currentYearMonth();

  // Ensure a row exists for the current month, then increment via RPC.
  await supabase.from("ai_usage").upsert(
    {
      user_id: userId,
      year_month: yearMonth,
      messages_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,year_month", ignoreDuplicates: true }
  );

  await supabase.rpc("increment_ai_usage", {
    p_user_id: userId,
    p_year_month: yearMonth,
  });
}

// Whether the business has any quota remaining for this month.
export async function hasAiQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const usage = await getAiUsage(supabase, userId);
  return usage.remaining > 0;
}
