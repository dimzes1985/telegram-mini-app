import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { parseJsonBody, invalidJsonResponse, validationErrorResponse } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { addDemoContact } from "@/lib/demo-store";
import { saveAndNotifyLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contactSchema = z
  .object({
    kind: z.enum(["question", "setup", "chat"]).default("question"),
    name: z.string().trim().min(1, "Укажите имя").max(200),
    contact: z.string().trim().max(200).optional(),
    niche: z.string().trim().max(100).optional(),
    message: z.string().trim().max(2000).optional(),
    // "I agree to the processing of personal data" checkbox.
    consent: z.literal(true, { error: "Нужно согласие на обработку персональных данных" }),
    // Honeypot: real people never fill this hidden field.
    website: z.string().max(0).optional(),
  })
  .refine((d) => d.kind === "setup" || Boolean(d.message), {
    message: "Напишите ваш вопрос",
    path: ["message"],
  })
  .refine((d) => d.kind === "question" || Boolean(d.contact), {
    message: "Укажите телефон или Telegram, чтобы мы могли ответить",
    path: ["contact"],
  });

// POST /api/contact - a question or a "set it up for me" request from the
// landing page; delivered to the Slot owner (Telegram/MAX, push, e-mail).
export async function POST(req: Request) {
  pruneRateLimitBuckets();

  const { allowed, retryAfterMs } = await rateLimit(`contact:${getClientIp(req)}`, {
    windowMs: 60 * 60 * 1000,
    max: 5,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много сообщений. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const { kind, name, contact, niche, message } = parsed.data;

  if (!isSupabaseConfigured()) {
    addDemoContact({ name, contact, message: message || `[${kind}] ${niche || ""}` });
    return NextResponse.json({ ok: true, demo: true });
  }

  const ok = await saveAndNotifyLead(createAdminClient(), { kind, name, contact, niche, message });
  if (!ok) {
    return NextResponse.json({ error: "Не удалось отправить. Напишите нам в Telegram." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
