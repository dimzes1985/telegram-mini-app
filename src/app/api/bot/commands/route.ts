import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setBotCommands } from "@/lib/telegram-bot";

// POST - Set bot commands for the authenticated user's bot
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find bot token for the current user
  const { data: userData } = await supabase
    .from("users")
    .select("bot_token")
    .eq("id", user.id)
    .single();

  if (!userData?.bot_token) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 400 });
  }

  // Set bot commands in Russian
  const result = await setBotCommands(userData.bot_token, [
    { command: "start", description: "Начать работу с ботом" },
    { command: "help", description: "Показать справку" },
    { command: "services", description: "Наши услуги" },
    { command: "info", description: "Информация о бизнесе" },
    { command: "book", description: "Записаться" },
  ]);

  return NextResponse.json(result);
}
