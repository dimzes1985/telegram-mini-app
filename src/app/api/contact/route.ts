import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaxMessage } from "@/lib/max-bot";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { z } from "zod";
import {
  parseJsonBody,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Имя обязательно").max(200),
  contact: z.string().trim().max(500).optional(),
  message: z.string().trim().min(1, "Сообщение обязательно").max(2000),
});

// Where contact-form messages are delivered.
// The owner's own MAX bot (configured in the admin panel) is used as the
// delivery channel; the recipient is the owner's MAX user id.
const OWNER_BUSINESS_ID =
  process.env.CONTACT_BUSINESS_ID ||
  "0173527d-6470-4d93-b7a2-9b9b51c032f5";
const OWNER_MAX_USER_ID = Number(process.env.CONTACT_MAX_USER_ID || 30876538);

// POST /api/contact - forward a landing page feedback form to the owner via MAX
export async function POST(req: Request) {
  pruneRateLimitBuckets();

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { allowed, retryAfterMs } = await rateLimit(`contact:${ip}`, {
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

  const { name, contact, message } = parsed.data;

  const admin = createAdminClient();
  const { data: owner, error } = await admin
    .from("users")
    .select("max_bot_token")
    .eq("id", OWNER_BUSINESS_ID)
    .not("max_bot_token", "is", null)
    .maybeSingle();

  if (error || !owner?.max_bot_token) {
    return NextResponse.json(
      { error: "Обратная связь временно недоступна" },
      { status: 503 }
    );
  }

  const text = [
    "Новое сообщение с сайта",
    `Имя: ${name}`,
    contact ? `Контакт: ${contact}` : null,
    "---",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    await sendMaxMessage(owner.max_bot_token, OWNER_MAX_USER_ID, text);
  } catch (e) {
    console.error("Contact delivery failed:", e);
    return NextResponse.json(
      { error: "Не удалось отправить сообщение" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
