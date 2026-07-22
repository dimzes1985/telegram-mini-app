import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET user settings
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query basic columns first (always exist)
  const { data, error } = await supabase
    .from("users")
    .select("business_name, system_prompt, working_hours")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Try to get bot columns (might not exist yet)
  let botData: { bot_token: string | null; bot_username: string | null; bot_webhook_set: boolean } = { bot_token: null, bot_username: null, bot_webhook_set: false };
  try {
    const { data: botResult } = await supabase
      .from("users")
      .select("bot_token, bot_username, bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (botResult) {
      botData = {
        bot_token: botResult.bot_token,
        bot_username: botResult.bot_username,
        bot_webhook_set: botResult.bot_webhook_set || false,
      };
    }
  } catch {
    // Columns might not exist yet
  }

  // Mask bot token for security
  const maskedData = {
    ...data,
    ...botData,
    bot_token: botData.bot_token ? "••••••••" + botData.bot_token.slice(-8) : null,
    bot_token_set: !!botData.bot_token,
  };

  return NextResponse.json(maskedData);
}

// PUT update user settings
export async function PUT(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { business_name, system_prompt, working_hours, bot_token, bot_username } = body;

  const updateData: Record<string, unknown> = {};
  if (business_name !== undefined) updateData.business_name = business_name;
  if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
  if (working_hours !== undefined) updateData.working_hours = working_hours;

  // Handle bot token - only update if it's not the masked value
  if (bot_token !== undefined && bot_token && !bot_token.startsWith("••••")) {
    updateData.bot_token = bot_token;
    // Extract username from token by calling Telegram API
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${bot_token}/getMe`
      );
      const data = await response.json();
      if (data.ok) {
        updateData.bot_username = data.result.username;
      }
    } catch {
      // Ignore error, token might be invalid
    }
  }
  if (bot_username !== undefined) updateData.bot_username = bot_username;

  // Try to update with all data
  const { data, error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id)
    .select("business_name, system_prompt, working_hours")
    .single();

  if (error) {
    // If error is about missing columns, try without bot fields
    if (error.message.includes("column") || error.message.includes("bot_")) {
      const basicData: Record<string, unknown> = {};
      if (business_name !== undefined) basicData.business_name = business_name;
      if (system_prompt !== undefined) basicData.system_prompt = system_prompt;
      if (working_hours !== undefined) basicData.working_hours = working_hours;

      const { data: retryData, error: retryError } = await supabase
        .from("users")
        .update(basicData)
        .eq("id", user.id)
        .select("business_name, system_prompt, working_hours")
        .single();

      if (retryError) {
        return NextResponse.json({ error: retryError.message }, { status: 500 });
      }
      return NextResponse.json(retryData);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
