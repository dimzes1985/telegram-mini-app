import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setWebhook, getWebhookInfo, setBotCommands } from "@/lib/telegram-bot";
import { randomBytes } from "crypto";

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

    // Set bot commands in Russian
    await setBotCommands(botToken, [
      { command: "start", description: "Начать работу с ботом" },
      { command: "help", description: "Показать справку" },
      { command: "services", description: "Наши услуги" },
      { command: "info", description: "Информация о бизнесе" },
      { command: "book", description: "Записаться" },
    ]);

    // Store webhook secret and mark as configured
    try {
      await admin
        .from("users")
        .update({ bot_webhook_secret: secret, bot_webhook_set: true })
        .eq("id", user.id);
    } catch {
      // Column might not exist, ignore
    }

    // Get webhook info for verification
    const webhookInfo = await getWebhookInfo(botToken);

    return NextResponse.json({
      success: true,
      webhook_url: webhookUrl,
      webhook_info: webhookInfo.result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
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

  // Try to get bot data - handle missing columns gracefully
  let botToken: string | null = null;
  let botUsername: string | null = null;

  try {
    const { data: userData } = await supabase
      .from("users")
      .select("bot_token, bot_username, bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (userData) {
      botToken = userData.bot_token;
      botUsername = userData.bot_username;
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
  try {
    const info = await getWebhookInfo(botToken);
    const parsed = info as { ok?: boolean; result?: Record<string, unknown> };
    if (parsed?.ok) {
      webhookInfoResult = parsed.result || null;
    } else {
      tokenValid = false;
    }
  } catch {
    tokenValid = false;
  }

  const actualWebhookSet = tokenValid && !!webhookInfoResult?.url;

  return NextResponse.json({
    configured: true,
    username: botUsername,
    webhook_set: actualWebhookSet,
    token_valid: tokenValid,
    webhook_info: webhookInfoResult,
  });
}
