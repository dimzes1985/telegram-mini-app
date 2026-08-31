import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOwnerNotifyTargets, notifyOwner } from "@/lib/notify-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST - sends a test notification to the owner's configured Telegram and/or
// MAX channels, so the owner can verify that notifications work without
// creating a real booking.
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targets = await loadOwnerNotifyTargets(createAdminClient(), user.id);

  const telegramConfigured = !!(targets.bot_token && targets.telegram_notify_chat_id);
  const maxConfigured = !!(targets.max_bot_token && targets.max_notify_user_id);

  if (!telegramConfigured && !maxConfigured) {
    return NextResponse.json(
      {
        error:
          "Ни один канал не настроен. Укажите Telegram chat ID и/или MAX user ID в настройках.",
      },
      { status: 400 }
    );
  }

  // Await delivery so the result is truthful (a dropped notification would
  // otherwise look like a success).
  await notifyOwner(
    targets,
    "🔔 Тестовое уведомление: канал настроен и работает!"
  );

  const delivered: string[] = [];
  if (telegramConfigured) delivered.push("telegram");
  if (maxConfigured) delivered.push("max");

  return NextResponse.json({
    success: true,
    sent_to: delivered,
  });
}
