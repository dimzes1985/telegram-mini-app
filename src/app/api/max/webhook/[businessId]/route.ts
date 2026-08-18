import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendMaxMessage,
  answerMaxCallback,
  maxCallbackButton,
  maxOpenAppButton,
  getMaxBotInfo,
  getMaxUserId,
  type MaxUpdate,
} from "@/lib/max-bot";
import { buildBusinessInfoText, type BusinessInfo } from "@/lib/business-info";
import { generateAiReply } from "@/lib/ai-assistant";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";

const WELCOME_MENU_ITEMS: Array<[string, string]> = [
  ["show_services", "📋 Наши услуги"],
  ["show_info", "ℹ️ О бизнесе"],
];

function plainInfoText(user: BusinessInfo): string {
  // MAX bot messages are plain text (no HTML), so strip tags from the shared builder output
  return buildBusinessInfoText(user).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// POST - MAX webhook handler (per-business endpoint)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params;

  // Verify the secret that MAX sends in the webhook header
  const secret = req.headers.get("X-Max-Bot-Api-Secret");

  const supabase = createAdminClient();
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, business_name, business_description, business_address, business_phone, business_email, working_hours, max_bot_token, max_bot_username, max_bot_webhook_secret"
    )
    .eq("id", businessId)
    .not("max_bot_token", "is", null)
    .single();

  if (error || !user?.max_bot_token) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Reject requests if the MAX bot was never fully configured via the admin panel
  if (!user.max_bot_webhook_secret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // Reject requests that don't carry the matching secret
  if (secret !== user.max_bot_webhook_secret) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const update: MaxUpdate = await req.json();
  const botToken = user.max_bot_token;

  // TEMPORARY diagnostic: forward minimal update metadata (no message text)
  // to a webhook collector so we can verify MAX actually delivers events.
  try {
    await fetch("https://webhook.site/3be62979-5e12-4099-98c2-561323678fd4", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        update_type: update.update_type,
        ts: update.timestamp,
        user_id: getMaxUserId(update) ?? null,
        mid: update.message?.body?.mid ?? null,
        sender_is_bot: update.message?.sender?.is_bot ?? null,
      }),
    });
  } catch {
    // diagnostics must never break webhook processing
  }

  // Resolve the bot public name (needed for open_app buttons)
  let botPublicName = user.max_bot_username || "";
  if (!botPublicName) {
    try {
      const info = await getMaxBotInfo(botToken);
      botPublicName = info.username || "";
      if (botPublicName) {
        await supabase.from("users").update({ max_bot_username: botPublicName }).eq("id", user.id);
      }
    } catch {
      botPublicName = "";
    }
  }

  const userId = getMaxUserId(update);
  if (!userId) {
    return NextResponse.json({ ok: true });
  }

  const infoText = plainInfoText(user as unknown as BusinessInfo);

  const sendMenu = async () => {
    const buttons = WELCOME_MENU_ITEMS.map(([payload, text]) => [maxCallbackButton(text, payload)]);
    if (botPublicName) {
      buttons.push([maxOpenAppButton("📅 Записаться", botPublicName, String(user.id))]);
    }
    await sendMaxMessage(
      botToken,
      userId,
      `👋 Добро пожаловать в ${user.business_name || "наш сервис"}!\n\nЯ могу помочь вам:\n• Узнать об услугах\n• Записаться на прием\n• Получить информацию о бизнесе\n\nКак я могу вам помочь?`,
      buttons
    );
  };

  const sendServices = async () => {
    const { data: services } = await supabase
      .from("services")
      .select("id, title, price, duration_minutes")
      .eq("user_id", user.id)
      .eq("active", true);

    if (!services || services.length === 0) {
      await sendMaxMessage(botToken, userId, "Услуги пока не добавлены.");
      return;
    }

    const lines = services.map((s) => `• ${s.title} — ${s.price} ₽ (${s.duration_minutes} мин)`);
    const buttons: ReturnType<typeof maxOpenAppButton>[][] = [];
    if (botPublicName) {
      buttons.push([maxOpenAppButton("📅 Записаться", botPublicName, String(user.id))]);
    }
    await sendMaxMessage(botToken, userId, `📋 Наши услуги:\n\n${lines.join("\n")}`, buttons);
  };

  const updateType = update.update_type;

  const safe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      console.error("MAX webhook send failed:", err instanceof Error ? err.message : err);
    }
  };

  // Handle callback button presses
  if (updateType === "message_callback" && update.callback) {
    await answerMaxCallback(botToken, update.callback.callback_id);

    if (update.callback.payload === "show_services") {
      await safe(sendServices);
    } else if (update.callback.payload === "show_info") {
      await safe(() => sendMaxMessage(botToken, userId, infoText));
    }

    return NextResponse.json({ ok: true });
  }

  if (updateType === "bot_started") {
    await safe(sendMenu);
    return NextResponse.json({ ok: true });
  }

  if (updateType === "message_created") {
    const text = update.message?.body?.text || "";
    const command = text.split(" ")[0].toLowerCase();

    // Ignore messages the bot itself sent (MAX echoes bot sends back as
    // message_created updates); otherwise we'd answer our own messages.
    if (update.message?.sender?.is_bot) {
      return NextResponse.json({ ok: true });
    }

    switch (command) {
      case "/start":
        await safe(sendMenu);
        break;

      case "/help":
        await safe(() =>
          sendMaxMessage(
            botToken,
            userId,
            `📖 Доступные команды:\n\n/start - Приветствие\n/services - Наши услуги\n/info - Информация о бизнесе\n/help - Эта справка\n\nВы также можете просто написать сообщение, и я постараюсь помочь!`
          )
        );
        break;

      case "/info":
        await safe(() => sendMaxMessage(botToken, userId, infoText));
        break;

      case "/services":
        await safe(sendServices);
        break;

      case "/book":
        await safe(() => {
          if (botPublicName) {
            return sendMaxMessage(
              botToken,
              userId,
              "Готовы записаться? Откройте наше приложение:",
              [[maxOpenAppButton("📅 Записаться", botPublicName, String(user.id))]]
            );
          }
          return sendMaxMessage(
            botToken,
            userId,
            "Запись через приложение временно недоступна. Напишите нам, и мы подберём время."
          );
        });
        break;

      default:
        await safe(async () => {
          if (text.startsWith("/")) {
            return sendMaxMessage(
              botToken,
              userId,
              "Неизвестная команда. Напишите /help для списка доступных команд."
            );
          }

          // Free-form messages are answered by the AI assistant, mirroring the
          // Telegram webhook behaviour.
          pruneRateLimitBuckets();
          const limit = rateLimit(`max:ai:${user.id}:${userId}`, {
            windowMs: 60_000,
            max: 10,
          });
          if (!limit.allowed) {
            return sendMaxMessage(
              botToken,
              userId,
              "Пожалуйста, подождите немного перед следующим вопросом 🙂"
            );
          }

          const reply = await generateAiReply(user.id, [
            { role: "user", content: text },
          ]);

          const bookButtons: ReturnType<typeof maxOpenAppButton>[][] = [];
          if (botPublicName) {
            bookButtons.push([
              maxOpenAppButton("📅 Записаться", botPublicName, String(user.id)),
            ]);
          }

          if (!reply.ok) {
            if (reply.reason === "quota") {
              return sendMaxMessage(
                botToken,
                userId,
                "Извините, месячный лимит сообщений исчерпан. Пожалуйста, обратитесь к владельцу бизнеса."
              );
            }
            return sendMaxMessage(
              botToken,
              userId,
              "Извините, что-то пошло не так. Попробуйте ещё раз чуть позже или откройте наше приложение:",
              bookButtons
            );
          }

          const answer =
            reply.text.length > 4000 ? reply.text.slice(0, 4000) : reply.text;
          return sendMaxMessage(botToken, userId, answer, bookButtons);
        });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
