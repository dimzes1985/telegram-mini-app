import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyMessengerCustomer } from "@/lib/customer-auth";
import { MAX_MANAGE_TOKENS, type CustomerScope } from "@/lib/customer-bookings";

export const customerRequestSchema = z.object({
  business_id: z.string().uuid("Некорректный id бизнеса"),
  platform: z.enum(["telegram", "max", "mobile"]),
  initData: z.string().max(10_000).optional().default(""),
  tokens: z.array(z.string().uuid()).max(MAX_MANAGE_TOKENS).optional().default([]),
});

export type CustomerRequest = z.infer<typeof customerRequestSchema>;

export interface BusinessForCustomer {
  business_name: string | null;
  bot_token: string | null;
  max_bot_token: string | null;
  telegram_notify_chat_id: string | null;
  max_notify_user_id: string | null;
}

// Loads the business and resolves who the customer is:
// messenger users by signed initData, mobile users by device-stored tokens.
export async function resolveCustomer(
  supabase: SupabaseClient,
  req: CustomerRequest
): Promise<
  | { ok: true; business: BusinessForCustomer; scope: CustomerScope }
  | { ok: false; status: number; error: string }
> {
  const { data: business } = await supabase
    .from("users")
    .select("business_name, bot_token, max_bot_token, telegram_notify_chat_id, max_notify_user_id")
    .eq("id", req.business_id)
    .maybeSingle();

  if (!business) {
    return { ok: false, status: 404, error: "Бизнес не найден" };
  }

  if (req.platform === "mobile") {
    return { ok: true, business, scope: { kind: "tokens", tokens: req.tokens } };
  }

  const verified = verifyMessengerCustomer(business, req.platform, req.initData);
  if (!verified.ok) return verified;
  return { ok: true, business, scope: { kind: "messenger", customer: verified.customer } };
}
