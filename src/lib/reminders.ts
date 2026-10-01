import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUSINESS_TIMEZONE, nowInTimeZone } from "@/lib/business-time";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { sendMaxMessage } from "@/lib/max-bot";
import { escapeHtml } from "@/lib/notify-owner";
import { bookingEndTime } from "@/lib/slot";

const BATCH_LIMIT = 500;

interface ReminderRow {
  id: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  source: string | null;
  customer_messenger_id: string | null;
  service: { title: string; duration_minutes: number } | null;
  business: {
    business_name: string | null;
    business_address: string | null;
    business_phone: string | null;
    bot_token: string | null;
    max_bot_token: string | null;
  } | null;
}

export interface ReminderRunResult {
  date: string;
  found: number;
  sent: number;
  failed: number;
}

// Calendar date `days` after `date` (YYYY-MM-DD).
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function buildReminderText(row: ReminderRow, html: boolean): string {
  const esc = (v: string) => (html ? escapeHtml(v) : v);
  const time = row.booking_time.slice(0, 5);
  const end = bookingEndTime(time, row.service?.duration_minutes ?? 30);
  const [y, m, d] = row.booking_date.split("-");
  const lines = [
    `🔔 Напоминаем о записи завтра, ${d}.${m}.${y}`,
    "",
    `🛠 ${esc(row.service?.title ?? "Услуга")}`,
    `🕒 ${time}–${end}`,
  ];
  if (row.business?.business_name) lines.push(`🏢 ${esc(row.business.business_name)}`);
  if (row.business?.business_address) lines.push(`📍 ${esc(row.business.business_address)}`);
  if (row.business?.business_phone) lines.push(`📞 ${esc(row.business.business_phone)}`);
  lines.push("", "Если планы изменились, отмените запись в приложении в разделе «Мои записи».");
  return lines.join("\n");
}

async function deliver(row: ReminderRow): Promise<boolean> {
  const chatId = Number(row.customer_messenger_id);
  if (!Number.isFinite(chatId) || !row.business) return false;
  try {
    if (row.source === "telegram" && row.business.bot_token) {
      const res = (await sendTelegramMessage(
        row.business.bot_token,
        chatId,
        buildReminderText(row, true)
      )) as { ok?: boolean };
      return res?.ok === true;
    }
    if (row.source === "max" && row.business.max_bot_token) {
      const res = (await sendMaxMessage(
        row.business.max_bot_token,
        chatId,
        buildReminderText(row, false)
      )) as { message?: unknown };
      return Boolean(res?.message);
    }
  } catch (e) {
    console.error("Reminder delivery failed:", row.id, e);
  }
  return false;
}

// Sends "tomorrow" reminders to customers who booked via Telegram / MAX.
// Each booking is reminded at most once (reminder_sent_at), even if delivery
// fails (e.g. the customer blocked the bot), so retries never spam.
export async function sendTomorrowReminders(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<ReminderRunResult> {
  const tomorrow = addDaysIso(nowInTimeZone(DEFAULT_BUSINESS_TIMEZONE, now).date, 1);

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, booking_time, customer_name, source, customer_messenger_id, service:services(title, duration_minutes), business:users(business_name, business_address, business_phone, bot_token, max_bot_token)"
    )
    .eq("booking_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .is("reminder_sent_at", null)
    .in("source", ["telegram", "max"])
    .not("customer_messenger_id", "is", null)
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(`Reminder query failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ReminderRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const ok = await deliver(row);
    if (ok) sent++;
    else failed++;
    await supabase
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return { date: tomorrow, found: rows.length, sent, failed };
}
