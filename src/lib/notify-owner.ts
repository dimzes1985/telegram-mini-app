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

// Outcome of one notification channel.
export interface ChannelDeliveryResult {
  channel: "telegram" | "max";
  status: "sent" | "skipped" | "failed";
  reason?: string;
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

// Telegram's HTML parser supports only the &lt;, &gt; and &amp; entities.
// &quot; is NOT a valid entity - it makes Telegram reject the whole message
// with "can't parse entities", so quotes must be left as-is.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Sends a plain-text notification to the business owner's configured Telegram
// and/or MAX chats. Never rejects - a failed notification must not fail the
// caller (e.g. a booking or a payment event). Returns the per-channel outcome
// so callers can surface or log exactly why a channel was skipped or failed.
export async function notifyOwner(
  targets: OwnerNotifyTargets,
  text: string
): Promise<ChannelDeliveryResult[]> {
  const deliverTelegram = async (): Promise<ChannelDeliveryResult> => {
    if (!targets.bot_token) {
      return {
        channel: "telegram",
        status: "skipped",
        reason: "bot_token is not set",
      };
    }
    if (!targets.telegram_notify_chat_id) {
      console.warn(
        "Owner notification (Telegram) skipped: telegram_notify_chat_id is not set"
      );
      return {
        channel: "telegram",
        status: "skipped",
        reason: "telegram_notify_chat_id is not set",
      };
    }
    const chatId = Number(targets.telegram_notify_chat_id);
    if (!Number.isFinite(chatId)) {
      return {
        channel: "telegram",
        status: "skipped",
        reason: `invalid chat id: "${targets.telegram_notify_chat_id}"`,
      };
    }
    try {
      const response = await sendTelegramMessage(
        targets.bot_token,
        chatId,
        escapeHtml(text)
      );
      if (response && response.ok === false) {
        const reason =
          response.description || `Telegram API error (${response.error_code ?? "?"})`;
        console.error("Owner notification (Telegram) failed:", reason);
        return { channel: "telegram", status: "failed", reason };
      }
      return { channel: "telegram", status: "sent" };
    } catch (e) {
      console.error("Owner notification (Telegram) failed:", e);
      return {
        channel: "telegram",
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  };

  const deliverMax = async (): Promise<ChannelDeliveryResult> => {
    if (!targets.max_bot_token) {
      return {
        channel: "max",
        status: "skipped",
        reason: "max_bot_token is not set",
      };
    }
    if (!targets.max_notify_user_id) {
      console.warn(
        "Owner notification (MAX) skipped: max_notify_user_id is not set"
      );
      return {
        channel: "max",
        status: "skipped",
        reason: "max_notify_user_id is not set",
      };
    }
    const maxUserId = Number(targets.max_notify_user_id);
    if (!Number.isFinite(maxUserId)) {
      return {
        channel: "max",
        status: "skipped",
        reason: `invalid user id: "${targets.max_notify_user_id}"`,
      };
    }
    try {
      await sendMaxMessage(targets.max_bot_token, maxUserId, text);
      return { channel: "max", status: "sent" };
    } catch (e) {
      console.error("Owner notification (MAX) failed:", e);
      return {
        channel: "max",
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  };

  const [telegram, max] = await Promise.all([deliverTelegram(), deliverMax()]);
  return [telegram, max];
}
