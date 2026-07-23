import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendTelegramMessage,
  sendWebAppButton,
  sendServiceButtons,
  answerCallbackQuery,
  type TelegramUpdate,
} from "@/lib/telegram-bot";

// POST - Telegram webhook handler
export async function POST(req: Request) {
  const update: TelegramUpdate = await req.json();

  // Get message or callback query
  const message = update.message || update.callback_query?.message;
  const callbackData = update.callback_query?.data;
  const chatId = message?.chat.id;
  const text = message?.text || "";

  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Find the bot owner by bot_username or bot_token
  // For now, we'll use a simple approach - find user with this bot
  const { data: user } = await supabase
    .from("users")
    .select("id, business_name, bot_token, bot_username")
    .not("bot_token", "is", null)
    .single();

  if (!user?.bot_token) {
    return NextResponse.json({ ok: true });
  }

  const botToken = user.bot_token;
  const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app?business_id=${user.id}`;

  // Handle callback queries (button clicks)
  if (update.callback_query) {
    await answerCallbackQuery(botToken, update.callback_query.id);

    if (callbackData === "show_services") {
      const { data: services } = await supabase
        .from("services")
        .select("id, title, price")
        .eq("user_id", user.id)
        .eq("active", true);

      if (services && services.length > 0) {
        await sendServiceButtons(botToken, chatId!, services, appUrl);
      } else {
        await sendTelegramMessage(botToken, chatId!, "No services available yet.");
      }
    } else if (callbackData === "open_app") {
      await sendWebAppButton(
        botToken,
        chatId!,
        "Open our booking app:",
        appUrl,
        "📅 Book Now"
      );
    }

    return NextResponse.json({ ok: true });
  }

  // Handle commands
  if (text.startsWith("/")) {
    const command = text.split(" ")[0].toLowerCase();

    switch (command) {
      case "/start":
        await sendTelegramMessage(
          botToken,
          chatId!,
          `👋 Welcome to <b>${user.business_name}</b>!\n\nI can help you:\n• Learn about our services\n• Book appointments\n• Get answers to your questions\n\nHow can I help you today?`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📅 Book Appointment", web_app: { url: appUrl } },
                ],
                [
                  { text: "📋 View Services", callback_data: "show_services" },
                ],
                [{ text: "❓ Help", callback_data: "show_help" }],
              ],
            },
          }
        );
        break;

      case "/help":
        await sendTelegramMessage(
          botToken,
          chatId!,
          `📖 <b>Available Commands:</b>\n\n/start - Welcome message\n/services - View our services\n/book - Book an appointment\n/help - Show this help message\n\nYou can also just type your question and I'll help you!`
        );
        break;

      case "/services":
      case "/book":
        const { data: services } = await supabase
          .from("services")
          .select("id, title, price")
          .eq("user_id", user.id)
          .eq("active", true);

        if (services && services.length > 0) {
          if (command === "/book") {
            await sendWebAppButton(
              botToken,
              chatId!,
              "Ready to book? Open our booking app:",
              appUrl,
              "📅 Book Now"
            );
          } else {
            await sendServiceButtons(botToken, chatId!, services, appUrl);
          }
        } else {
          await sendTelegramMessage(
            botToken,
            chatId!,
            "No services available at the moment. Please check back later!"
          );
        }
        break;

      default:
        await sendTelegramMessage(
          botToken,
          chatId!,
          "Unknown command. Type /help to see available commands."
        );
    }

    return NextResponse.json({ ok: true });
  }

  // Handle regular messages - use AI chat
  // For now, send a simple response with app link
  await sendTelegramMessage(
    botToken,
    chatId!,
    `Thanks for your message! For detailed assistance, please use our booking app:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💬 Chat with AI Assistant",
              web_app: { url: appUrl },
            },
          ],
        ],
      },
    }
  );

  return NextResponse.json({ ok: true });
}
