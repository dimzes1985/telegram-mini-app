import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOwnerNotifyTargets, notifyOwner } from "@/lib/notify-owner";
import { sendPushToOwner } from "@/lib/push";
import { escapeHtml, isMailerConfigured, sendMail } from "@/lib/mailer";

// The Slot owner's own business account: its Telegram/MAX bot, phone app
// (push) and e-mail receive the requests from the landing page.
export const SUPPORT_BUSINESS_ID =
  process.env.CONTACT_BUSINESS_ID || "0173527d-6470-4d93-b7a2-9b9b51c032f5";
export const SUPPORT_TELEGRAM = "DmitrKuleshov";

export type LeadKind = "question" | "setup" | "chat";

export interface LeadInput {
  kind: LeadKind;
  name: string;
  contact?: string | null;
  niche?: string | null;
  message?: string | null;
}

export const LEAD_TITLES: Record<LeadKind, string> = {
  question: "✉️ Вопрос с сайта",
  setup: "🛠 Заявка: настроить бесплатно",
  chat: "💬 Вопрос из чата на сайте",
};

export function leadText(lead: LeadInput): string {
  return [
    LEAD_TITLES[lead.kind],
    "",
    `👤 Имя: ${lead.name}`,
    lead.contact ? `📞 Контакт: ${lead.contact}` : null,
    lead.niche ? `🏷 Сфера: ${lead.niche}` : null,
    lead.message ? `\n${lead.message}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Saves the request and notifies the owner on every channel. Returns false
// only when it was neither saved nor delivered anywhere.
export async function saveAndNotifyLead(admin: SupabaseClient, lead: LeadInput): Promise<boolean> {
  const { error: saveError } = await admin.from("leads").insert({
    kind: lead.kind,
    name: lead.name,
    contact: lead.contact || null,
    niche: lead.niche || null,
    message: lead.message || null,
    consent_at: new Date().toISOString(),
  });
  if (saveError) console.error("Lead save failed:", saveError);

  const text = leadText(lead);
  const targets = await loadOwnerNotifyTargets(admin, SUPPORT_BUSINESS_ID).catch(() => null);
  const [channels, pushed, mailed] = await Promise.all([
    targets ? notifyOwner(targets, text) : Promise.resolve([]),
    sendPushToOwner(SUPPORT_BUSINESS_ID, {
      title: LEAD_TITLES[lead.kind],
      body: `${lead.name}${lead.contact ? `, ${lead.contact}` : ""}${lead.message ? `\n${lead.message.slice(0, 120)}` : ""}`,
      url: "/admin",
    }),
    isMailerConfigured()
      ? sendMail({
          to: process.env.SUPPORT_EMAIL || process.env.SMTP_USER || "",
          subject: `${LEAD_TITLES[lead.kind]} — ${lead.name}`,
          text,
          html: `<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
        }).then(
          () => true,
          (e) => {
            console.error("Lead e-mail failed:", e);
            return false;
          }
        )
      : Promise.resolve(false),
  ]);
  const delivered = channels.some((c) => c.status === "sent") || pushed > 0 || mailed;
  return !saveError || delivered;
}
