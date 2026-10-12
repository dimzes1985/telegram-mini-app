import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  setWebhook,
  getWebhookInfo,
  setBotCommands,
  TelegramNetworkError,
} from "@/lib/telegram-bot";
import { randomBytes } from "crypto";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function generateSecret() {
  return randomBytes(32).toString("hex");
}

// POST - Setup bot webhook
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "В демо-режиме Telegram-бот не подключается. Укажите токен после настройки Supabase." },
      { status: 400 }
    );
  }

  // Get bot token - handle missing columns gracefully
  let botToken: string | null = null;
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("bot_token")
      .eq("id", user.id)
      .single();
    botToken = userData?.bot_token;
  } catch {
    return NextResponse.json(
      { error: "Bot integration not available. Please add bot_token column to users table." },
      { status: 400 }
    );
  }

  if (!botToken) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 400 });
  }

  // Generate (or reuse) a per-business webhook secret
  const admin = createAdminClient();
  let secret = "";
  try {
    const { data: userData } = await admin
      .from("users")
      .select("bot_webhook_secret")
      .eq("id", user.id)
      .single();
    secret = userData?.bot_webhook_secret || generateSecret();
  } catch {
    secret = generateSecret();
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const webhookUrl = `${baseUrl}/api/bot/webhook/${user.id}`;

  try {
    // Set webhook with per-business URL and secret token
    const webhookResult = await setWebhook(botToken, webhookUrl, secret);

    if (!webhookResult.ok) {
      return NextResponse.json(
        { error: webhookResult.description || "Failed to set webhook" },
        { status: 400 }
      );
    }

    // The webhook is set: remember it right away, so a hiccup in the optional
    // steps below cannot leave the business marked as "not configured".
    try {
      await admin
        .from("users")
        .update({ bot_webhook_secret: secret, bot_webhook_set: true })
        .eq("id", user.id);
    } catch {
      // Column might not exist, ignore
    }

    // Set bot commands in Russian (optional, never fails the setup)
    await setBotCommands(botToken, [
      { command: "start", description: "Начать работу с ботом" },
      { command: "help", description: "Показать справку" },
      { command: "services", description: "Наши услуги" },
      { command: "info", description: "Информация о бизнесе" },
      { command: "book", description: "Записаться" },
    ]).catch(() => null);

    const webhookInfo = await getWebhookInfo(botToken).catch(() => null);

    return NextResponse.json({
      success: true,
      webhook_url: webhookUrl,
      webhook_info: webhookInfo?.result ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof TelegramNetworkError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Setup failed",
      },
      { status: error instanceof TelegramNetworkError ? 503 : 500 }
    );
  }
}

// GET - Check webhook status
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false });
  }

  // Try to get bot data - handle missing columns gracefully
  let botToken: string | null = null;
  let botUsername: string | null = null;
  let storedWebhookSet = false;

  try {
    const { data: userData } = await supabase
      .from("users")
      .select("bot_token, bot_username, bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (userData) {
      botToken = userData.bot_token;
      botUsername = userData.bot_username;
      storedWebhookSet = userData.bot_webhook_set === true;
    }
  } catch {
    // Columns might not exist
  }

  if (!botToken) {
    return NextResponse.json({ configured: false });
  }

  // Verify the real state with Telegram instead of trusting the stored flag:
  // if the token was replaced/revoked after setup (or was never valid), the
  // bot cannot deliver messages even though bot_webhook_set may read as true.
  let webhookInfoResult: Record<string, unknown> | null = null;
  let tokenValid = true;
  let networkError = false;
  try {
    const info = await getWebhookInfo(botToken);
    const parsed = info as { ok?: boolean; result?: Record<string, unknown> };
    if (parsed?.ok) {
      webhookInfoResult = parsed.result || null;
    } else {
      tokenValid = false;
    }
  } catch {
    // Telegram unreachable right now: that says nothing about the token, so
    // fall back to the stored state instead of reporting a broken bot.
    networkError = true;
  }

  const actualWebhookSet = networkError
    ? storedWebhookSet
    : tokenValid && !!webhookInfoResult?.url;

  return NextResponse.json({
    configured: true,
    username: botUsername,
    webhook_set: actualWebhookSet,
    token_valid: tokenValid,
    network_error: networkError,
    webhook_info: webhookInfoResult,
  });
}
