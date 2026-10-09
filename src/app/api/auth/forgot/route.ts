import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { escapeHtml, isMailerConfigured, sendMail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

// Same answer whether or not the account exists (no account enumeration).
const OK_MESSAGE =
  "Если такая почта зарегистрирована, мы отправили на неё письмо со ссылкой для смены пароля. Проверьте также папку «Спам».";

// POST /api/auth/forgot {email}: emails a one-time password reset link.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите корректную почту" }, { status: 400 });
  }
  const { email } = parsed.data;

  if (!isSupabaseConfigured() || !isMailerConfigured()) {
    return NextResponse.json(
      { error: "Восстановление пароля пока не настроено. Напишите в поддержку." },
      { status: 503 }
    );
  }

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`forgot:ip:${getClientIp(req)}`, { windowMs: 60 * 60_000, max: 10 }),
    rateLimit(`forgot:email:${email}`, { windowMs: 60 * 60_000, max: 3 }),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте через час." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    // Unknown email: answer the same way.
    return NextResponse.json({ ok: true, message: OK_MESSAGE });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const link = `${baseUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;

  try {
    await sendMail({
      to: email,
      subject: "Смена пароля в Slot",
      text: `Здравствуйте!\n\nВы запросили смену пароля в Slot. Откройте ссылку, чтобы задать новый пароль (действует 1 час):\n${link}\n\nЕсли это были не вы, просто проигнорируйте письмо.`,
      html: `<p>Здравствуйте!</p><p>Вы запросили смену пароля в Slot. Нажмите кнопку, чтобы задать новый пароль (ссылка действует 1 час):</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Задать новый пароль</a></p><p style="color:#6b7280;font-size:13px">Если это были не вы, просто проигнорируйте письмо.</p>`,
    });
  } catch (e) {
    console.error("Password reset email failed:", e);
    return NextResponse.json(
      { error: "Не удалось отправить письмо. Попробуйте позже." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: OK_MESSAGE });
}
