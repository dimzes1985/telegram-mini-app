import { convertToModelMessages, streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getAiUsage, incrementAiUsage } from "@/lib/ai-usage";
import { getAiModel } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/ai-assistant";

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
  const limit = await rateLimit(`chat:${businessId}:${messengerUserId}`, {
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

  const systemPrompt = buildSystemPrompt(user, services ?? []);

  // The client (useChat + DefaultChatTransport) sends messages in UIMessage
  // format ({ id, role, parts }). streamText expects ModelMessage[] (with
  // `content`), so convert when parts are present.
  const modelMessages = Array.isArray(messages?.[0]?.parts)
    ? await convertToModelMessages(messages)
    : messages;

  const result = streamText({
    model: getAiModel(),
    system: systemPrompt,
    messages: modelMessages,
    onFinish: async () => {
      // Count the assistant response toward the monthly quota
      await incrementAiUsage(supabase, businessId);
    },
  });

  return result.toUIMessageStreamResponse();
}
