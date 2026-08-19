import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/payment-method/unbind
// Detach the saved YooKassa payment method from the user's subscription.
// YooKassa can't delete saved methods itself — the store must stop using the
// method ID. This clears it locally and disables auto-renewal.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("yookassa_payment_method_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.yookassa_payment_method_id) {
    return NextResponse.json(
      { error: "No saved payment method" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      yookassa_payment_method_id: null,
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
