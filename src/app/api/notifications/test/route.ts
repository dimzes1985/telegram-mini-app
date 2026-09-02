import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOwnerNotifyTargets, notifyOwner } from "@/lib/notify-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST - sends a test notification to the owner's configured Telegram and/or
// MAX channels, so the owner can verify that notifications work without
// creating a real booking. Reports the per-channel result (sent / skipped /
// failed + reason) so the UI can explain why a channel is not delivering.
//
// Always answers with JSON: any unexpected error is turned into a structured
// response instead of an HTML 500 page, so the admin UI can display the cause.
export async function POST() {
  try {
    const supabase = await createClient();

    let user: { id: string } | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    } catch (e) {
      return NextResponse.json(
        {
          error: `Не удалось проверить сессию: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        { status: 401 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targets = await loadOwnerNotifyTargets(createAdminClient(), user.id);

    const telegramConfigured = !!(
      targets.bot_token && targets.telegram_notify_chat_id
    );
    const maxConfigured = !!(
      targets.max_bot_token && targets.max_notify_user_id
    );

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
    const channels = await notifyOwner(
      targets,
      "🔔 Тестовое уведомление: канал настроен и работает!"
    );

    const anySent = channels.some((c) => c.status === "sent");
    return NextResponse.json({ success: anySent, channels });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Внутренняя ошибка: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 }
    );
  }
}
