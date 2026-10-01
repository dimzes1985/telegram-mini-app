import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendMaxMessage } from "@/lib/max-bot";
import { escapeHtml } from "@/lib/notify-owner";
import { bookingEndTime } from "@/lib/slot";
import { formatRuDate } from "@/lib/place-booking";

export interface CustomerNotifyBooking {
  booking_date: string;
  booking_time: string;
  source?: string | null;
  customer_messenger_id?: string | null;
  service?: { title?: string | null; duration_minutes?: number | null } | null;
}

export function buildStatusText(
  booking: CustomerNotifyBooking,
  status: "confirmed" | "cancelled",
  businessName: string | null,
  html: boolean
): string {
  const esc = (v: string) => (html ? escapeHtml(v) : v);
  const time = booking.booking_time.slice(0, 5);
  const end = bookingEndTime(time, booking.service?.duration_minutes ?? 30);
  const title = esc(booking.service?.title ?? "Услуга");
  const when = `${formatRuDate(booking.booking_date)}, ${time}–${end}`;
  const from = businessName ? `\n🏢 ${esc(businessName)}` : "";
  return status === "confirmed"
    ? `✅ Ваша запись подтверждена\n\n🛠 ${title}\n🕒 ${when}${from}\n\nЖдём вас!`
    : `❌ Ваша запись отменена\n\n🛠 ${title}\n🕒 ${when}${from}\n\nЕсли это ошибка или вы хотите выбрать другое время — запишитесь заново в приложении.`;
}

// Tells a Telegram / MAX customer that the owner confirmed or cancelled the
// booking. Never throws: a failed message must not fail the status change.
export async function notifyCustomerStatus(
  admin: SupabaseClient,
  businessId: string,
  booking: CustomerNotifyBooking,
  status: "confirmed" | "cancelled"
): Promise<boolean> {
  try {
    const chatId = Number(booking.customer_messenger_id);
    if (!booking.customer_messenger_id || !Number.isFinite(chatId)) return false;
    if (booking.source !== "telegram" && booking.source !== "max") return false;

    const { data: business } = await admin
      .from("users")
      .select("business_name, bot_token, max_bot_token")
      .eq("id", businessId)
      .maybeSingle();
    if (!business) return false;

    if (booking.source === "telegram" && business.bot_token) {
      const res = (await sendTelegramMessage(
        business.bot_token,
        chatId,
        buildStatusText(booking, status, business.business_name, true)
      )) as { ok?: boolean };
      return res?.ok === true;
    }
    if (booking.source === "max" && business.max_bot_token) {
      const res = await sendMaxMessage(
        business.max_bot_token,
        chatId,
        buildStatusText(booking, status, business.business_name, false)
      );
      return Boolean(res?.message);
    }
  } catch (e) {
    console.error("notifyCustomerStatus failed:", e);
  }
  return false;
}
