import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { setWebhook } from "@/lib/telegram-bot";
import {
  getMaxSubscriptions,
  subscribeMaxWebhook,
  unsubscribeMaxWebhook,
} from "@/lib/max-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BotRow {
  id: string;
  bot_token: string | null;
  bot_webhook_secret: string | null;
  max_bot_token: string | null;
  max_bot_webhook_secret: string | null;
}

// POST /api/cron/rebind-bots (Authorization: Bearer <CRON_SECRET>)
// Points every business's Telegram and MAX bot webhooks at the current
// NEXT_PUBLIC_APP_URL. Used after moving the app to a new domain.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isCronRequestAuthorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ demo: true });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://")) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL must be https" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, bot_token, bot_webhook_secret, max_bot_token, max_bot_webhook_secret")
    .or("bot_token.not.is.null,max_bot_token.not.is.null");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ business: string; telegram?: string; max?: string }> = [];
  for (const row of (data ?? []) as BotRow[]) {
    const result: { business: string; telegram?: string; max?: string } = { business: row.id };

    if (row.bot_token) {
      try {
        const tgSecret = row.bot_webhook_secret || randomBytes(32).toString("hex");
        const res = await setWebhook(row.bot_token, `${baseUrl}/api/bot/webhook/${row.id}`, tgSecret);
        result.telegram = res?.ok ? "ok" : `error: ${res?.description ?? "unknown"}`;
        if (res?.ok && !row.bot_webhook_secret) {
          await admin
            .from("users")
            .update({ bot_webhook_secret: tgSecret, bot_webhook_set: true })
            .eq("id", row.id);
        }
      } catch (e) {
        result.telegram = `error: ${(e as Error).message}`;
      }
    }

    if (row.max_bot_token) {
      try {
        const maxSecret = row.max_bot_webhook_secret || randomBytes(32).toString("hex");
        const url = `${baseUrl}/api/max/webhook/${row.id}`;
        const existing = await getMaxSubscriptions(row.max_bot_token);
        for (const sub of existing.subscriptions ?? []) {
          if (sub.url !== url) await unsubscribeMaxWebhook(row.max_bot_token, sub.url);
        }
        const res = await subscribeMaxWebhook(row.max_bot_token, url, maxSecret);
        result.max = res?.success ? "ok" : `error: ${res?.message ?? "unknown"}`;
        if (res?.success && !row.max_bot_webhook_secret) {
          await admin
            .from("users")
            .update({ max_bot_webhook_secret: maxSecret, max_bot_webhook_set: true })
            .eq("id", row.id);
        }
      } catch (e) {
        result.max = `error: ${(e as Error).message}`;
      }
    }
    results.push(result);
  }

  return NextResponse.json({ baseUrl, count: results.length, results });
}
