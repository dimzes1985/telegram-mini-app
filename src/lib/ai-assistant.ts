import { streamText, tool, isStepCount, zodSchema } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage, incrementAiUsage } from "@/lib/ai-usage";
import { getAiModel } from "@/lib/ai";
import {
  getConversationHistory,
  appendConversationMessages,
  type ConversationChannel,
} from "@/lib/conversation";
import { createBookingForBusiness } from "@/lib/create-booking";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

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

// Current date/time in the business timezone (Russia / Moscow). The model has
// no built-in clock, so without this it cannot translate "завтра"/"послезавтра"
// into a correct date and ends up offering dates that are already in the past.
const BUSINESS_TIMEZONE = "Europe/Moscow";

function currentDateContext(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "long",
  }).format(now);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `Сегодня: ${get("year")}-${get("month")}-${get("day")} (${weekday}). Текущее время: ${time}.`;
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

${currentDateContext()}

Бизнес: ${user?.business_name || "Наш бизнес"}
${user?.business_description ? `Описание: ${user.business_description}` : ""}
${user?.business_address ? `Адрес: ${user.business_address}` : ""}
${user?.business_phone ? `Телефон: ${user.business_phone}` : ""}
${user?.business_email ? `Email: ${user.business_email}` : ""}

Доступные услуги:
${servicesContext}

ВАЖНЫЕ ПРАВИЛА ПОВЕДЕНИЯ:
1. Приветствие — ТОЛЬКО в самом первом сообщении диалога. Во всех последующих репликах этой же беседы НИКОГДА не начинай ответ с «Здравствуйте», «Добрый день» или подобных приветствий — сразу отвечай по существу. Это правило важнее любых примеров ниже.
2. Если клиент хочет записаться на услугу, уточни у него: название услуги, желаемую дату (ГГГГ-ММ-ДД), время (ЧЧ:ММ) и имя. Когда все данные собраны — обязательно вызови инструмент create_booking.
3. Когда клиент говорит «завтра», «послезавтра», «в понедельник» и т.п., рассчитывай дату строго от сегодняшней даты, приведённой выше. Сегодняшняя дата и текущее время — всегда в контексте выше.
4. Подтверждай запись клиенту ТОЛЬКО после того, как инструмент create_booking вернул «ЗАПИСЬ СОЗДАНА». Если инструмент вернул «ОШИБКА» (время занято, библиотека закрыта и т.п.) — объясни причину клиенту и предложи другие варианты.`;
}

// The booking tool lets the assistant actually create a booking at the exact
// date and time the customer asked for.
export function makeBookingTool(supabase: SupabaseClient, businessId: string) {
  return tool({
    description:
      "Записать клиента на услугу на конкретные дату и время. Вызывай, когда клиент назвал услугу, желаемую дату (ГГГГ-ММ-ДД), время (ЧЧ:ММ) и своё имя. Номер телефона передавай, только если клиент его сообщил.",
    inputSchema: zodSchema(
      z.object({
        service_title: z.string().describe("Название услуги, которую выбрал клиент"),
        booking_date: z.string().describe("Дата в формате ГГГГ-ММ-ДД"),
        booking_time: z.string().describe("Время в формате ЧЧ:ММ"),
        customer_name: z.string().describe("Имя клиента"),
        customer_phone: z
          .string()
          .optional()
          .describe("Номер телефона клиента (если клиент его сообщил)"),
        customer_notes: z
          .string()
          .optional()
          .describe("Комментарий клиента к записи"),
      })
    ),
    execute: async (input) => {
      const result = await createBookingForBusiness(supabase, businessId, input);
      return result.ok
        ? `ЗАПИСЬ СОЗДАНА: ${result.message}`
        : `ОШИБКА: ${result.error}`;
    },
  });
}

export type AiReplyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not_found" | "quota" | "error"; message: string };

// How many model turns a single reply may take (user turn + tool call + final
// text). Default is 1, which would stop after the tool call without the
// confirmation text.
const MAX_REPLY_STEPS = 3;

// Generates a complete (non-streaming) AI reply for a business.
// Used by messenger bots that send the answer straight into the chat.
export async function generateAiReply(
  businessId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  conversation?: { channel: ConversationChannel; channelUserId: string }
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

  // Load previous dialog turns (if any) so the model knows this is a
  // continuation and does not re-greet or lose the booking context.
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (conversation) {
    history = await getConversationHistory(
      supabase,
      businessId,
      conversation.channel,
      conversation.channelUserId
    );
  }

  try {
    const result = streamText({
      model: getAiModel(),
      system,
      messages: [...history, ...messages],
      tools: { create_booking: makeBookingTool(supabase, businessId) },
      stopWhen: isStepCount(MAX_REPLY_STEPS),
    });
    const text = await result.text;

    // Persist this turn so the next message continues the same dialog.
    if (conversation) {
      await appendConversationMessages(
        supabase,
        businessId,
        conversation.channel,
        conversation.channelUserId,
        [...messages, { role: "assistant", content: text }]
      );
    }

    // Count the assistant response toward the monthly quota
    await incrementAiUsage(supabase, businessId);
    return { ok: true, text };
  } catch (e) {
    console.error("AI reply error:", e);
    return { ok: false, reason: "error", message: (e as Error).message };
  }
}
