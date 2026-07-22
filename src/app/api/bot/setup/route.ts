import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setWebhook, getWebhookInfo, setBotCommands } from "@/lib/telegram-bot";

// POST - Setup bot webhook
export async function POST(req: Request) {
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${baseUrl}/api/bot/webhook`;

  try {
    // Set webhook
    const webhookResult = await setWebhook(botToken, webhookUrl);

    if (!webhookResult.ok) {
      return NextResponse.json(
        { error: webhookResult.description || "Failed to set webhook" },
        { status: 400 }
      );
    }

    // Set bot commands
    await setBotCommands(botToken, [
      { command: "start", description: "Start the bot" },
      { command: "help", description: "Show help" },
      { command: "services", description: "View services" },
      { command: "book", description: "Book an appointment" },
    ]);

    // Update user record - handle missing column gracefully
    try {
      await supabase
        .from("users")
        .update({ bot_webhook_set: true })
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
  let botWebhookSet = false;

  try {
    const { data: userData } = await supabase
      .from("users")
      .select("bot_token, bot_username, bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (userData) {
      botToken = userData.bot_token;
      botUsername = userData.bot_username;
      botWebhookSet = userData.bot_webhook_set || false;
    }
  } catch {
    // Columns might not exist
  }

  if (!botToken) {
    return NextResponse.json({ configured: false });
  }

  try {
    const webhookInfo = await getWebhookInfo(botToken);
    return NextResponse.json({
      configured: true,
      username: botUsername,
      webhook_set: botWebhookSet,
      webhook_info: webhookInfo.result,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      username: botUsername,
      webhook_set: false,
    });
  }
}
