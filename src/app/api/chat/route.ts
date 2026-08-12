import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";
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
  const { messages, businessId, initData, platform = "telegram" } = await req.json();

  if (!businessId) {
    return jsonError("businessId required", 400);
  }

  if (!initData) {
    return jsonError("initData required", 401);
  }

  const supabase = createAdminClient();

  // Fetch business + bot token(s) for initData verification
  const { data: user } = await supabase
    .from("users")
    .select(
      "system_prompt, business_name, business_description, business_address, business_phone, business_email, bot_token, bot_webhook_secret, max_bot_token"
    )
    .eq("id", businessId)
    .single();

  if (!user) {
    return jsonError("Business not found", 404);
  }

  const isMax = platform === "max";
  const botToken = isMax ? user.max_bot_token : user.bot_token;

  // Reject requests from businesses that never connected a bot (no way to verify)
  if (!botToken) {
    return jsonError(isMax ? "Business has no MAX bot configured" : "Business has no bot configured", 403);
  }

  // Verify the customer is genuinely coming from the messenger Mini App
  const verification = isMax
    ? verifyMaxInitData(initData, botToken)
    : verifyInitData(initData, botToken);
  if (!verification.valid) {
    return jsonError(verification.error || "Invalid initData", 401);
  }

  const messengerUserId = verification.user?.id;
  if (!messengerUserId) {
    return jsonError("Could not identify user", 401);
  }

  // Rate limit per user + business to protect AI costs
  pruneRateLimitBuckets();
  const limit = rateLimit(`chat:${businessId}:${messengerUserId}`, {
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

  try {
    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages,
      onFinish: async () => {
        // Count the assistant response toward the monthly quota
        await incrementAiUsage(supabase, businessId);
      },
    });

    const text = await result.text;
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    console.error("chat error:", e);
    const err = e as Error & {
      statusCode?: number;
      cause?: Error;
      requestBodyValues?: unknown;
      url?: string;
    };
    return jsonError(
      JSON.stringify({
        error: err.message,
        name: err.name,
        statusCode: err.statusCode,
        cause: err.cause ? { name: err.cause.name, message: err.cause.message } : null,
        url: err.url || null,
        requestBodyValues: err.requestBodyValues || null,
      }),
      500
    );
  }
}
