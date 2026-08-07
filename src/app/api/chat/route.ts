import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getAiUsage, incrementAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const { messages, businessId, initData } = await req.json();

  if (!businessId) {
    return jsonError("businessId required", 400);
  }

  if (!initData) {
    return jsonError("Telegram initData required", 401);
  }

  const supabase = createAdminClient();

  // Fetch business + bot token for initData verification
  const { data: user } = await supabase
    .from("users")
    .select(
      "system_prompt, business_name, business_description, business_address, business_phone, business_email, bot_token, bot_webhook_secret"
    )
    .eq("id", businessId)
    .single();

  if (!user) {
    return jsonError("Business not found", 404);
  }

  // Reject requests from businesses that never connected a bot (no way to verify)
  if (!user.bot_token) {
    return jsonError("Business has no bot configured", 403);
  }

  // Verify the customer is genuinely coming from the Telegram Mini App
  const verification = verifyInitData(initData, user.bot_token);
  if (!verification.valid) {
    return jsonError(verification.error || "Invalid initData", 401);
  }

  const telegramUserId = verification.user?.id;
  if (!telegramUserId) {
    return jsonError("Could not identify Telegram user", 401);
  }

  // Rate limit per user + business to protect AI costs
  pruneRateLimitBuckets();
  const limit = rateLimit(`chat:${businessId}:${telegramUserId}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!limit.allowed) {
    return jsonError("Too many requests, please slow down", 429);
  }

  // Enforce the monthly AI message quota for the business plan
  const usage = await getAiUsage(supabase, businessId);
  if (usage.remaining <= 0) {
    return jsonError(
      "The business has reached its monthly AI message limit. Please contact the business owner.",
      429
    );
  }

  // Fetch available services
  const { data: services } = await supabase
    .from("services")
    .select("title, description, price, duration_minutes")
    .eq("user_id", businessId)
    .eq("active", true);

  const servicesContext = services
    ?.map(
      (s) =>
        `- ${s.title}: $${s.price} (${s.duration_minutes} min)${s.description ? ` - ${s.description}` : ""}`
    )
    .join("\n") || "No services available.";

  const systemPrompt = `${user?.system_prompt || "You are a helpful assistant."}

Business: ${user?.business_name || "Our Business"}
${user?.business_description ? `Description: ${user.business_description}` : ""}
${user?.business_address ? `Address: ${user.business_address}` : ""}
${user?.business_phone ? `Phone: ${user.business_phone}` : ""}
${user?.business_email ? `Email: ${user.business_email}` : ""}

Available Services:
${servicesContext}

You can help customers:
1. Learn about our services and pricing
2. Answer questions about availability
3. Guide them through the booking process

When a customer wants to book, ask for:
- Which service they want
- Their preferred date and time
- Their name and phone number

Be friendly, professional, and helpful.`;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages,
    onFinish: async () => {
      // Count the assistant response toward the monthly quota
      await incrementAiUsage(supabase, businessId);
    },
  });

  return result.toTextStreamResponse();
}
