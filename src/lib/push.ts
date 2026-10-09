import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Web push to the business owner's phones (installed admin app).
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@slot-zapis.ru",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

// Sends to every subscribed device of the owner. Never rejects; returns the
// number of devices that accepted the notification.
export async function sendPushToOwner(userId: string, payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  try {
    setup();
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    let sent = 0;
    await Promise.all(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 24 }
          );
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // The device unsubscribed or the subscription expired.
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("Web push failed:", e);
          }
        }
      })
    );
    return sent;
  } catch (e) {
    console.error("Web push failed:", e);
    return 0;
  }
}
