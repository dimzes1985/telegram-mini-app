import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token_hash: z.string().min(10).max(500),
  password: z.string().min(6, "Пароль должен быть не короче 6 символов").max(72),
});

// POST /api/auth/reset {token_hash, password}: checks the one-time link from
// the email, signs the user in and sets the new password.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Проверьте данные" },
      { status: 400 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Недоступно в демо-режиме" }, { status: 503 });
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.token_hash,
  });
  if (verifyError) {
    return NextResponse.json(
      { error: "Ссылка устарела или уже использована. Запросите новую." },
      { status: 400 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json(
      {
        error: /different from the old/i.test(error.message)
          ? "Новый пароль должен отличаться от старого."
          : "Не удалось сменить пароль. Попробуйте ещё раз.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
