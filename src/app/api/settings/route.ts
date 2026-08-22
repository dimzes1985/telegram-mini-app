import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiUsage } from "@/lib/ai-usage";
import { getMaxBotInfo } from "@/lib/max-bot";
import { parseJsonBody, invalidJsonResponse } from "@/lib/http";

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
    .select("business_name, business_description, business_address, business_phone, business_email, system_prompt, working_hours, plan")
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

  // Try to get MAX bot columns (might not exist yet)
  let maxBotData: { max_bot_token: string | null; max_bot_username: string | null; max_bot_webhook_set: boolean } = { max_bot_token: null, max_bot_username: null, max_bot_webhook_set: false };
  try {
    const { data: maxBotResult } = await supabase
      .from("users")
      .select("max_bot_token, max_bot_username, max_bot_webhook_set")
      .eq("id", user.id)
      .single();
    if (maxBotResult) {
      maxBotData = {
        max_bot_token: maxBotResult.max_bot_token,
        max_bot_username: maxBotResult.max_bot_username,
        max_bot_webhook_set: maxBotResult.max_bot_webhook_set || false,
      };
    }
  } catch {
    // Columns might not exist yet
  }

  // Try to get notification columns (might not exist yet)
  let notifyData: { telegram_notify_chat_id: string | null; max_notify_user_id: string | null } = { telegram_notify_chat_id: null, max_notify_user_id: null };
  try {
    const { data: notifyResult } = await supabase
      .from("users")
      .select("telegram_notify_chat_id, max_notify_user_id")
      .eq("id", user.id)
      .single();
    if (notifyResult) {
      notifyData = {
        telegram_notify_chat_id: notifyResult.telegram_notify_chat_id,
        max_notify_user_id: notifyResult.max_notify_user_id,
      };
    }
  } catch {
    // Columns might not exist yet
  }

  // Mask bot token for security
  const maskedData: Record<string, unknown> = {
    id: user.id,
    ...data,
    ...botData,
    ...maxBotData,
    ...notifyData,
    bot_token: botData.bot_token ? "••••••••" + botData.bot_token.slice(-8) : null,
    bot_token_set: !!botData.bot_token,
    max_bot_token: maxBotData.max_bot_token ? "••••••••" + maxBotData.max_bot_token.slice(-8) : null,
    max_bot_token_set: !!maxBotData.max_bot_token,
  };

  // Include AI usage quota for the current plan
  try {
    const admin = createAdminClient();
    const usage = await getAiUsage(admin, user.id);
    maskedData.ai_usage = usage;
  } catch {
    // Usage table might not exist yet; omit it
  }

  return NextResponse.json(maskedData);
}// PUT update user settings
export async function PUT(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const raw = body as Record<string, unknown>;
  const {
    business_name,
    business_description,
    business_address,
    business_phone,
    business_email,
    system_prompt,
    working_hours,
    bot_username,
    max_bot_username,
    telegram_notify_chat_id,
    max_notify_user_id,
  } = raw;

  const bot_token = typeof raw.bot_token === "string" ? raw.bot_token : undefined;
  const max_bot_token = typeof raw.max_bot_token === "string" ? raw.max_bot_token : undefined;

  const updateData: Record<string, unknown> = {};
  if (business_name !== undefined) updateData.business_name = business_name;
  if (business_description !== undefined) updateData.business_description = business_description;
  if (business_address !== undefined) updateData.business_address = business_address;
  if (business_phone !== undefined) updateData.business_phone = business_phone;
  if (business_email !== undefined) updateData.business_email = business_email;
  if (system_prompt !== undefined) updateData.system_prompt = system_prompt;
  if (working_hours !== undefined) updateData.working_hours = working_hours;
  if (telegram_notify_chat_id !== undefined) updateData.telegram_notify_chat_id = telegram_notify_chat_id;
  if (max_notify_user_id !== undefined) updateData.max_notify_user_id = max_notify_user_id;

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

  // Handle MAX bot token - only update if it's not the masked value
  if (max_bot_token !== undefined && max_bot_token && !max_bot_token.startsWith("••••")) {
    updateData.max_bot_token = max_bot_token;
    updateData.max_bot_webhook_set = false;
    // Resolve the bot public name from the MAX API
    try {
      const info = await getMaxBotInfo(max_bot_token);
      updateData.max_bot_username = info.username || max_bot_username || null;
    } catch {
      if (max_bot_username !== undefined) updateData.max_bot_username = max_bot_username;
    }
  }
  if (max_bot_username !== undefined) updateData.max_bot_username = max_bot_username;

  // Try to update with all data
  const { data, error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id)
    .select("business_name, business_description, business_address, business_phone, business_email, system_prompt, working_hours")
    .single();

  if (error) {
    // If error is about missing columns, try without bot fields
    if (error.message.includes("column") || error.message.includes("bot_")) {
      const basicData: Record<string, unknown> = {};
      if (business_name !== undefined) basicData.business_name = business_name;
      if (business_description !== undefined) basicData.business_description = business_description;
      if (business_address !== undefined) basicData.business_address = business_address;
      if (business_phone !== undefined) basicData.business_phone = business_phone;
      if (business_email !== undefined) basicData.business_email = business_email;
      if (system_prompt !== undefined) basicData.system_prompt = system_prompt;
      if (working_hours !== undefined) basicData.working_hours = working_hours;

      const { data: retryData, error: retryError } = await supabase
        .from("users")
        .update(basicData)
        .eq("id", user.id)
        .select("business_name, business_description, business_address, business_phone, business_email, system_prompt, working_hours")
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
