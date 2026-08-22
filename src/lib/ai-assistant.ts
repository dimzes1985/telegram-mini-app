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
// and its live service catalog. The prompt is written in Russian because the
// assistant talks to Russian-speaking customers.
export function buildSystemPrompt(user: AiBusiness, services: AiService[]): string {
  const servicesContext =
    services
      ?.map(
        (s) =>
          `- ${s.title}: ${s.price} ₽ (${s.duration_minutes} мин)${s.description ? ` — ${s.description}` : ""}`
      )
      .join("\n") || "Услуг пока нет.";

  return `${user?.system_prompt || "Вы — полезный ассистент."}

Бизнес: ${user?.business_name || "Наш бизнес"}
${user?.business_description ? `Описание: ${user.business_description}` : ""}
${user?.business_address ? `Адрес: ${user.business_address}` : ""}
${user?.business_phone ? `Телефон: ${user.business_phone}` : ""}
${user?.business_email ? `Email: ${user.business_email}` : ""}

Доступные услуги:
${servicesContext}

Вы можете помогать клиентам:
1. Узнавать об услугах и ценах
2. Отвечать на вопросы о доступности
3. Помогать записаться

Когда клиент хочет записаться, узнайте:
- Какую услугу он выбирает
- Желаемую дату и время
- Его имя и номер телефона

Отвечайте дружелюбно, вежливо и по-русски.`;
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
