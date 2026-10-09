import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sendPushToOwner } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/push/test: sends a test notification to the owner's devices.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`push-test:${user.id}`, { windowMs: 10 * 60_000, max: 5 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Слишком часто. Попробуйте позже." }, { status: 429 });
  }

  const sent = await sendPushToOwner(user.id, {
    title: "Slot",
    body: "✅ Уведомления работают! Сюда будут приходить новые записи.",
    url: "/admin/bookings",
  });
  if (!sent) {
    return NextResponse.json({ error: "Не удалось отправить. Включите уведомления заново." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, sent });
}
