import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendTelegramMessage,
  sendWebAppButton,
  sendServiceButtons,
  answerCallbackQuery,
  type TelegramUpdate,
} from "@/lib/telegram-bot";

const LIBRARY_INFO = `📚 <b>Библиотека Уварово</b>

Муниципальное бюджетное учреждение культуры
«Централизованная библиотечная система г. Уварово»

📍 Адрес: 393460, Тамбовская обл., г. Уварово, 2-й мкр, д. 8
📞 Телефон: 8 (47558) 4-11-80
✉️ Email: bibluv@yandex.ru
👤 Директор: Терентьева Ольга Викторовна

🕐 Время работы:
Пн-Сб: 9:00 - 18:00
Перерыв: 13:00 - 14:00
Вс: выходной`;

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
        await sendTelegramMessage(botToken, chatId!, "Услуги пока не добавлены.");
      }
    } else if (callbackData === "open_app") {
      await sendWebAppButton(
        botToken,
        chatId!,
        "Откройте наше приложение для записи:",
        appUrl,
        "📅 Записаться"
      );
    } else if (callbackData === "show_info") {
      await sendTelegramMessage(botToken, chatId!, LIBRARY_INFO);
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
          `👋 Добро пожаловать в <b>${user.business_name}</b>!\n\nЯ могу помочь вам:\n• Узнать об услугах библиотеки\n• Записаться на мероприятия\n• Получить информацию о часах работы\n\nКак я могу вам помочь?`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📋 Наши услуги", callback_data: "show_services" },
                ],
                [
                  { text: "ℹ️ О библиотеке", callback_data: "show_info" },
                ],
                [
                  { text: "💬 Задать вопрос", web_app: { url: appUrl } },
                ],
              ],
            },
          }
        );
        break;

      case "/help":
        await sendTelegramMessage(
          botToken,
          chatId!,
          `📖 <b>Доступные команды:</b>\n\n/start - Приветствие\n/services - Наши услуги\n/info - Информация о библиотеке\n/help - Эта справка\n\nВы также можете просто написать сообщение, и я постараюсь помочь!`
        );
        break;

      case "/info":
        await sendTelegramMessage(botToken, chatId!, LIBRARY_INFO);
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
              "Готовы записаться? Откройте наше приложение:",
              appUrl,
              "📅 Записаться"
            );
          } else {
            await sendServiceButtons(botToken, chatId!, services, appUrl);
          }
        } else {
          await sendTelegramMessage(
            botToken,
            chatId!,
            "Услуги пока не добавлены. Пожалуйста, загляните позже!"
          );
        }
        break;

      default:
        await sendTelegramMessage(
          botToken,
          chatId!,
          "Неизвестная команда. Напишите /help для списка доступных команд."
        );
    }

    return NextResponse.json({ ok: true });
  }

  // Handle regular messages - use AI chat
  await sendTelegramMessage(
    botToken,
    chatId!,
    `Спасибо за ваше сообщение! Для более подробной помощи, пожалуйста, используйте наше приложение:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💬 Задать вопрос ИИ-ассистенту",
              web_app: { url: appUrl },
            },
          ],
        ],
      },
    }
  );

  return NextResponse.json({ ok: true });
}
