import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setBotCommands } from "@/lib/telegram-bot";

// POST - Set bot commands (public endpoint for setup)
export async function POST() {
  const supabase = createAdminClient();

  // Find bot token
  const { data: user } = await supabase
    .from("users")
    .select("bot_token")
    .not("bot_token", "is", null)
    .single();

  if (!user?.bot_token) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 400 });
  }

  // Set bot commands in Russian
  const result = await setBotCommands(user.bot_token, [
    { command: "start", description: "Начать работу с ботом" },
    { command: "help", description: "Показать справку" },
    { command: "services", description: "Наши услуги" },
    { command: "info", description: "Информация о библиотеке" },
    { command: "book", description: "Записаться" },
  ]);

  return NextResponse.json(result);
}
