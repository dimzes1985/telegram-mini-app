import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendTelegramMessage,
  sendTelegramMessageChunked,
  sendWebAppButton,
  sendServiceButtons,
  buildQuickActionsKeyboard,
  answerCallbackQuery,
  type TelegramUpdate,
} from "@/lib/telegram-bot";
import { buildBusinessInfoText } from "@/lib/business-info";
import { generateAiReply } from "@/lib/ai-assistant";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";

// POST - Telegram webhook handler (per-business endpoint)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  // Verify the secret token that Telegram sends in every webhook request
  const secretToken = req.headers.get("X-Telegram-Bot-Api-Secret-Token");

  const supabase = createAdminClient();
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, business_name, business_description, business_address, business_phone, business_email, working_hours, bot_token, bot_username, bot_webhook_secret"
    )
    .eq("id", businessId)
    .not("bot_token", "is", null)
    .single();

  if (error || !user?.bot_token) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Reject requests if the bot was never fully configured via the admin panel
  if (!user.bot_webhook_secret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // Reject requests that don't carry the matching secret
  if (secretToken !== user.bot_webhook_secret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const update: TelegramUpdate = await req.json();

  // Get message or callback query
  const message = update.message || update.callback_query?.message;
  const callbackData = update.callback_query?.data;
  const chatId = message?.chat.id;
  const text = message?.text || "";

  // Debug logging - record every incoming update and outgoing send result
  await logWebhookEvent(user.id, chatId ?? null, "update", text || callbackData || "", {
    update_id: update.update_id,
  });

  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const botToken = user.bot_token;
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();
  const appUrl = `${appBaseUrl}/app?business_id=${user.id}`;
  const bookUrl = `${appBaseUrl}/book?business_id=${user.id}`;
  const infoText = buildBusinessInfoText(user);

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
        await sendServiceButtons(botToken, chatId!, services, bookUrl);
      } else {
        await sendTelegramMessage(botToken, chatId!, "Услуги пока не добавлены.");
      }
    } else if (callbackData === "open_app") {
      await sendWebAppButton(
        botToken,
        chatId!,
        "Готовы записаться? Выберите дату и время в приложении:",
        bookUrl,
        "📅 Записаться"
      );
    } else if (callbackData === "show_info") {
      await sendTelegramMessage(botToken, chatId!, infoText);
    }

    return NextResponse.json({ ok: true });
  }

  // Handle commands
  if (text.startsWith("/")) {
    const command = text.split(" ")[0].toLowerCase();

    switch (command) {
      case "/start": {
        const keyboard = buildQuickActionsKeyboard(appBaseUrl, user.id);
        keyboard.inline_keyboard.push([
          { text: "ℹ️ О бизнесе", callback_data: "show_info" },
        ]);
        const result = await sendTelegramMessage(
          botToken,
          chatId!,
          `👋 Добро пожаловать в <b>${user.business_name}</b>!\n\nЯ могу помочь вам:\n• Узнать об услугах\n• Записаться на прием\n• Получить информацию о бизнесе\n\nКак я могу вам помочь?`,
          {
            reply_markup: keyboard,
          }
        );
        await logWebhookEvent(user.id, chatId!, "start_reply", "", result);
        break;
      }

      case "/help":
        await sendTelegramMessage(
          botToken,
          chatId!,
          `📖 <b>Доступные команды:</b>\n\n/start - Приветствие\n/services - Наши услуги\n/info - Информация о бизнесе\n/help - Эта справка\n\nВы также можете просто написать сообщение, и я постараюсь помочь!`
        );
        break;

      case "/info":
        await sendTelegramMessage(botToken, chatId!, infoText);
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
              "Готовы записаться? Выберите дату и время в приложении:",
              bookUrl,
              "📅 Записаться"
            );
          } else {
            await sendServiceButtons(botToken, chatId!, services, bookUrl);
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

  // Handle regular messages - answer with the AI assistant
  pruneRateLimitBuckets();
  const limit = rateLimit(`tg:ai:${user.id}:${chatId}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Пожалуйста, подождите немного перед следующим вопросом 🙂"
    );
    return NextResponse.json({ ok: true });
  }

  const reply = await generateAiReply(user.id, [
    { role: "user", content: text },
  ]);

  if (!reply.ok) {
    if (reply.reason === "quota") {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Извините, месячный лимит сообщений исчерпан. Пожалуйста, обратитесь к владельцу бизнеса."
      );
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Извините, что-то пошло не так. Попробуйте ещё раз чуть позже или откройте наше приложение:",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💬 Задать вопрос в приложении",
                  web_app: { url: appUrl },
                },
              ],
            ],
          },
        }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const sendResults = await sendTelegramMessageChunked(botToken, chatId, reply.text, {
    reply_markup: buildQuickActionsKeyboard(appBaseUrl, user.id),
  });
  await logWebhookEvent(user.id, chatId, "ai_reply", "", sendResults);

  return NextResponse.json({ ok: true });
}

// Temporary debug helper - records webhook activity to the bot_webhook_logs table
async function logWebhookEvent(
  userId: string,
  chatId: number | null,
  event: string,
  updateText: string,
  detail: object
) {
  try {
    const client = createAdminClient();
    await client.from("bot_webhook_logs").insert({
      user_id: userId,
      chat_id: chatId,
      event,
      update_text: (updateText || "").slice(0, 500),
      detail: detail || {},
    });
  } catch {
    // Never fail the webhook because of logging
  }
}
