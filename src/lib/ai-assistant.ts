import { streamText } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, incrementAiUsage } from "@/lib/ai-usage";
import { getAiModel } from "@/lib/ai";

export interface AiBusiness {
  system_prompt?: string | null;
  business_name?: string | null;
  business_description?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
}

export interface AiService {
  title: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
}

// Builds the system prompt for the AI assistant from the business profile
// and its live service catalog.
export function buildSystemPrompt(user: AiBusiness, services: AiService[]): string {
  const servicesContext =
    services
      ?.map(
        (s) =>
          `- ${s.title}: $${s.price} (${s.duration_minutes} min)${s.description ? ` - ${s.description}` : ""}`
      )
      .join("\n") || "No services available.";

  return `${user?.system_prompt || "You are a helpful assistant."}

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
}

export type AiReplyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not_found" | "quota" | "error"; message: string };

// Generates a complete (non-streaming) AI reply for a business.
// Used by messenger bots that send the answer straight into the chat.
export async function generateAiReply(
  businessId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AiReplyResult> {
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select(
      "system_prompt, business_name, business_description, business_address, business_phone, business_email"
    )
    .eq("id", businessId)
    .single();

  if (!user) {
    return { ok: false, reason: "not_found", message: "Business not found" };
  }

  // Enforce the monthly AI message quota for the business plan
  const usage = await getAiUsage(supabase, businessId);
  if (usage.remaining <= 0) {
    return { ok: false, reason: "quota", message: "The monthly AI message limit is exhausted" };
  }

  const { data: services } = await supabase
    .from("services")
    .select("title, description, price, duration_minutes")
    .eq("user_id", businessId)
    .eq("active", true);

  const system = buildSystemPrompt(user, services ?? []);

  try {
    const result = streamText({ model: getAiModel(), system, messages });
    const text = await result.text;
    // Count the assistant response toward the monthly quota
    await incrementAiUsage(supabase, businessId);
    return { ok: true, text };
  } catch (e) {
    console.error("AI reply error:", e);
    return { ok: false, reason: "error", message: (e as Error).message };
  }
}
