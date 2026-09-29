import { SupabaseClient } from "@supabase/supabase-js";
import { getPlan, type Plan } from "@/lib/plans";

// How long an auto-renewing subscription keeps access after its period end
// while the recurring charge is being confirmed by the provider. Without this
// a user could briefly lose access between the period end and the webhook.
const RENEWAL_GRACE_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionRow {
  id?: string;
  user_id?: string;
  plan: string;
  status: string;
  yookassa_payment_id?: string | null;
  yookassa_payment_method_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  updated_at?: string;
}

// A subscription only grants its paid plan while the paid period is running.
// Active/trialing subscriptions whose period has ended keep access for a short
// grace window when they are set to auto-renew with a saved payment method.
export function isSubscriptionEntitled(
  sub: SubscriptionRow | null | undefined,
  now: Date = new Date()
): boolean {
  if (!sub) return false;

  if (sub.status !== "active" && sub.status !== "trialing") {
    return false;
  }

  const end = sub.current_period_end
    ? new Date(sub.current_period_end).getTime()
    : null;

  if (end === null || end > now.getTime()) {
    return true;
  }

  if (!sub.cancel_at_period_end && sub.yookassa_payment_method_id) {
    return now.getTime() - end <= RENEWAL_GRACE_MS;
  }

  return false;
}

export interface ReconcileResult {
  plan: Plan;
  subscription: SubscriptionRow | null;
}

// Reconciles the denormalized `users.plan` column with the subscription state.
// Once a subscription is no longer entitled (expired, cancelled or past due
// with the period over) the user is dropped back to the free plan and the
// subscription row is closed, so a stale `plan` value never survives expiry.
export async function reconcileUserPlan(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<ReconcileResult> {
  const { data: user } = await admin
    .from("users")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  // No subscription on file: keep whatever plan the user has (may have been
  // granted manually by an administrator).
  if (!sub) {
    return { plan: getPlan(user?.plan), subscription: null };
  }

  const subscription = sub as SubscriptionRow;

  if (isSubscriptionEntitled(subscription, now)) {
    const plan = getPlan(subscription.plan);
    if (getPlan(user?.plan) !== plan) {
      await admin.from("users").update({ plan }).eq("id", userId);
    }
    return { plan, subscription };
  }

  const closedStatus = subscription.cancel_at_period_end
    ? "cancelled"
    : "expired";
  const updatedAt = now.toISOString();

  if (subscription.status !== closedStatus) {
    await admin
      .from("subscriptions")
      .update({ status: closedStatus, updated_at: updatedAt })
      .eq("user_id", userId);
  }

  if (getPlan(user?.plan) !== "free") {
    await admin.from("users").update({ plan: "free" }).eq("id", userId);
  }

  return {
    plan: "free",
    subscription: {
      ...subscription,
      status: closedStatus,
      updated_at: updatedAt,
    },
  };
}
