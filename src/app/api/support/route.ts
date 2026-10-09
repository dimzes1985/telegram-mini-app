import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { getAiModel } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { parseSupportReply, supportSystemPrompt } from "@/lib/support-kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(800),
      })
    )
    .min(1)
    .max(20),
});

const FALLBACK =
  "Сейчас я не могу ответить. Оставьте вопрос Дмитрию — он ответит лично.";

// POST /api/support {messages}: the landing page AI consultant.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const [perIp, global] = await Promise.all([
    rateLimit(`support:${ip}`, { windowMs: 60 * 60_000, max: 20 }),
    rateLimit("support:global", { windowMs: 24 * 60 * 60_000, max: 1500 }),
  ]);
  if (!perIp.allowed || !global.allowed) {
    return NextResponse.json({
      reply: "Вы задали много вопросов подряд 🙂 Чтобы не ждать, передайте вопрос Дмитрию — он ответит лично.",
      handoff: true,
    });
  }

  if (!process.env.AI_API_KEY && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ reply: FALLBACK, handoff: true });
  }

  try {
    const { text } = await generateText({
      model: getAiModel(),
      system: supportSystemPrompt(),
      // Only the latest turns: enough context, bounded cost.
      messages: parsed.data.messages.slice(-10),
      maxOutputTokens: 500,
      temperature: 0.3,
      timeout: 25_000,
    });
    const { reply, handoff } = parseSupportReply(text);
    return NextResponse.json({ reply: reply || FALLBACK, handoff: handoff || !reply });
  } catch (e) {
    console.error("Support AI failed:", e);
    return NextResponse.json({ reply: FALLBACK, handoff: true });
  }
}
