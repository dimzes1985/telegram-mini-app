import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendMaxMessage } from "@/lib/max-bot";
import type { SupabaseClient } from "@supabase/supabase-js";

// Destination channels for owner notifications, taken from the users row.
export interface OwnerNotifyTargets {
  bot_token?: string | null;
  max_bot_token?: string | null;
  telegram_notify_chat_id?: string | null;
  max_notify_user_id?: string | null;
}

// Loads the notification destinations for a business owner from the users row.
export async function loadOwnerNotifyTargets(
  supabase: SupabaseClient,
  userId: string
): Promise<OwnerNotifyTargets> {
  const { data } = await supabase
    .from("users")
    .select(
      "bot_token, max_bot_token, telegram_notify_chat_id, max_notify_user_id"
    )
    .eq("id", userId)
    .single();
  return {
    bot_token: data?.bot_token ?? null,
    max_bot_token: data?.max_bot_token ?? null,
    telegram_notify_chat_id: data?.telegram_notify_chat_id ?? null,
    max_notify_user_id: data?.max_notify_user_id ?? null,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sends a plain-text notification to the business owner's configured Telegram
// and/or MAX chats. Never rejects - a failed notification must not fail the
// caller (e.g. a booking or a payment event).
//
// Returns a promise so callers can await delivery. On serverless runtimes the
// request lifecycle can otherwise drop the in-flight HTTP calls right after the
// response is returned, so notifications must be awaited (or at least started
// and kept alive) to actually reach the owner.
export async function notifyOwner(
  targets: OwnerNotifyTargets,
  text: string
): Promise<void> {
  const deliveries: Promise<unknown>[] = [];

  if (targets.telegram_notify_chat_id && targets.bot_token) {
    const chatId = Number(targets.telegram_notify_chat_id);
    if (Number.isFinite(chatId)) {
      deliveries.push(
        sendTelegramMessage(targets.bot_token, chatId, escapeHtml(text))
          .then((result) => {
            // Telegram answers with { ok: false, description } for rejected
            // messages (unknown chat, bot not started by the owner, ...).
            // Surface it instead of swallowing it silently.
            if (result && result.ok === false) {
              throw new Error(
                result.description || `Telegram API error (${result.error_code ?? "?"})`
              );
            }
          })
          .catch((e) =>
            console.error("Owner notification (Telegram) failed:", e)
          )
      );
    }
  } else if (targets.bot_token) {
    console.warn(
      "Owner notification (Telegram) skipped: telegram_notify_chat_id is not set"
    );
  }

  if (targets.max_notify_user_id && targets.max_bot_token) {
    const maxUserId = Number(targets.max_notify_user_id);
    if (Number.isFinite(maxUserId)) {
      deliveries.push(
        sendMaxMessage(targets.max_bot_token, maxUserId, text).catch((e) =>
          console.error("Owner notification (MAX) failed:", e)
        )
      );
    }
  } else if (targets.max_bot_token) {
    console.warn(
      "Owner notification (MAX) skipped: max_notify_user_id is not set"
    );
  }

  await Promise.allSettled(deliveries);
}
