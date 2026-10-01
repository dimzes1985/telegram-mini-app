import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
} from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getAiUsage, incrementAiUsage } from "@/lib/ai-usage";
import { getAiModel } from "@/lib/ai";
import { buildSystemPrompt, makeBookingTool, makeSlotsTool } from "@/lib/ai-assistant";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, buildDemoChatReply } from "@/lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How many model turns a single reply may take (user turn + tool call + final
// text). Default is 1, which would stop after the tool call without the
// confirmation text.
const MAX_REPLY_STEPS = 5;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const last = messages[messages.length - 1] as {
    content?: unknown;
    parts?: Array<{ type?: string; text?: string }>;
  };
  if (typeof last?.content === "string") return last.content;
  if (Array.isArray(last?.parts)) {
    return last.parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join("\n");
  }
  return "";
}

function demoChatResponse(messages: unknown): Response {
  const text = buildDemoChatReply(lastUserText(messages));
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "demo";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

// Only the last few turns are sent to the model; older context is not needed
// and an unbounded history would let a client burn the AI budget.
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

// Keeps only user/assistant text from the client-provided history so a client
// cannot inject system prompts or fake tool results.
function sanitizeMessages(raw: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw)) return [];
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of raw.slice(-MAX_HISTORY_MESSAGES)) {
    const msg = item as {
      role?: unknown;
      content?: unknown;
      parts?: Array<{ type?: string; text?: unknown }>;
    };
    if (msg?.role !== "user" && msg?.role !== "assistant") continue;
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.parts)) {
      text = msg.parts
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n");
    }
    text = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (text) result.push({ role: msg.role, content: text });
  }
  // The conversation must end with the customer's message.
  while (result.length && result[result.length - 1].role !== "user") result.pop();
  return result;
}

export async function POST(req: Request) {
  let body: {
    messages?: unknown;
    businessId?: unknown;
    initData?: unknown;
    platform?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  const { messages } = body;
  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  const initData = typeof body.initData === "string" ? body.initData : "";
  const platform = body.platform === "max" ? "max" : "telegram";

  if (!businessId) {
    return jsonError("businessId required", 400);
  }

  if (!isSupabaseConfigured()) {
    if (businessId !== DEMO_USER_ID) {
      return jsonError("Business not found", 404);
    }
    return demoChatResponse(messages);
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

  // The client (useChat) sends UIMessage objects; reduce them to plain
  // user/assistant text turns.
  const modelMessages = sanitizeMessages(messages);
  if (modelMessages.length === 0) {
    return jsonError("Empty message", 400);
  }

  const result = streamText({
    model: getAiModel(),
    system: systemPrompt,
    messages: modelMessages,
    tools: {
      get_available_slots: makeSlotsTool(supabase, businessId),
      create_booking: makeBookingTool(supabase, businessId, {
        source: isMax ? "max" : "telegram",
        messengerId: String(messengerUserId),
      }),
    },
    stopWhen: isStepCount(MAX_REPLY_STEPS),
    onFinish: async () => {
      // Count the assistant response toward the monthly quota
      await incrementAiUsage(supabase, businessId);
    },
  });

  return result.toUIMessageStreamResponse();
}
