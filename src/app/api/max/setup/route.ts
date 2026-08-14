import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import {
  getMaxBotInfo,
  subscribeMaxWebhook,
  getMaxSubscriptions,
  setMaxCommands,
} from "@/lib/max-bot";

function generateSecret() {
  return randomBytes(32).toString("hex");
}

// POST - Subscribe the MAX webhook for this business
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  let maxBotToken: string | null = null;
  let maxBotUsername: string | null = null;
  try {
    const { data: userData } = await admin
      .from("users")
      .select("max_bot_token, max_bot_username")
      .eq("id", user.id)
      .single();
    maxBotToken = userData?.max_bot_token;
    maxBotUsername = userData?.max_bot_username;
  } catch {
    return NextResponse.json(
      { error: "MAX bot integration not available. Please add the max_bot_* columns to the users table." },
      { status: 400 }
    );
  }

  if (!maxBotToken) {
    return NextResponse.json({ error: "MAX bot token not configured" }, { status: 400 });
  }

  // Resolve the bot public name (required for open_app buttons)
  if (!maxBotUsername) {
    try {
      const info = await getMaxBotInfo(maxBotToken);
      maxBotUsername = info.username || null;
    } catch {
      maxBotUsername = null;
    }
  }

  // Generate (or reuse) a per-business webhook secret
  let secret = "";
  try {
    const { data: userData } = await admin
      .from("users")
      .select("max_bot_webhook_secret")
      .eq("id", user.id)
      .single();
    secret = userData?.max_bot_webhook_secret || generateSecret();
  } catch {
    secret = generateSecret();
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const webhookUrl = `${baseUrl}/api/max/webhook/${user.id}`;

  try {
    // (Re)subscribe with the per-business URL and secret
    const result = await subscribeMaxWebhook(maxBotToken, webhookUrl, secret);
    if (!result.success) {
      return NextResponse.json(
        { error: result.message || "Failed to subscribe webhook" },
        { status: 400 }
      );
    }

    // Set bot commands in Russian
    await setMaxCommands(maxBotToken, [
      { name: "start", description: "Начать работу с ботом" },
      { name: "help", description: "Показать справку" },
      { name: "services", description: "Наши услуги" },
      { name: "info", description: "Информация о бизнесе" },
      { name: "book", description: "Записаться" },
    ]);

    // Store secret + mark configured
    try {
      await admin
        .from("users")
        .update({
          max_bot_webhook_secret: secret,
          max_bot_webhook_set: true,
          max_bot_username: maxBotUsername,
        })
        .eq("id", user.id);
    } catch {
      // Columns might not exist, ignore
    }

    const subscriptions = await getMaxSubscriptions(maxBotToken);

    return NextResponse.json({
      success: true,
      webhook_url: webhookUrl,
      username: maxBotUsername,
      subscriptions: subscriptions.subscriptions || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed" },
      { status: 500 }
    );
  }
}

// GET - Check MAX webhook subscription status
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let maxBotToken: string | null = null;
  let maxBotUsername: string | null = null;
  let maxBotWebhookSet = false;

  try {
    const { data: userData } = await supabase
      .from("users")
      .select("max_bot_token, max_bot_username, max_bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (userData) {
      maxBotToken = userData.max_bot_token;
      maxBotUsername = userData.max_bot_username;
      maxBotWebhookSet = userData.max_bot_webhook_set || false;
    }
  } catch {
    // Columns might not exist
  }

  if (!maxBotToken) {
    return NextResponse.json({ configured: false });
  }

  try {
    const subscriptions = await getMaxSubscriptions(maxBotToken);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
    const webhookUrl = `${baseUrl}/api/max/webhook/${user.id}`;
    const active = (subscriptions.subscriptions || []).some(
      (sub) => sub.url === webhookUrl
    );
    return NextResponse.json({
      configured: true,
      username: maxBotUsername,
      webhook_set: maxBotWebhookSet,
      subscription_active: active,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      username: maxBotUsername,
      webhook_set: false,
      subscription_active: false,
    });
  }
}
