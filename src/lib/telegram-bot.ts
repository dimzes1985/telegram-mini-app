const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramMessage["from"];
    message?: TelegramMessage;
    data?: string;
  };
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown";
    reply_markup?: object;
  }
) {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || "HTML",
      reply_markup: options?.reply_markup,
    }),
  });
  return response.json();
}

export async function sendWebAppButton(
  botToken: string,
  chatId: number,
  text: string,
  webAppUrl: string,
  buttonText: string = "Open App"
) {
  return sendTelegramMessage(botToken, chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: buttonText,
            web_app: { url: webAppUrl },
          },
        ],
      ],
    },
  });
}

export async function sendServiceButtons(
  botToken: string,
  chatId: number,
  services: Array<{ id: string; title: string; price: number }>,
  webAppUrl: string
) {
  const buttons = services.map((service) => {
    // Telegram inline keyboard button text max is 64 bytes
    // Russian chars are 2 bytes each in UTF-8, so max ~30 chars
    let title = service.title;
    if (title.length > 30) {
      title = title.substring(0, 27) + "...";
    }
    return [
      {
        text: `${title} - ${service.price} ₽`,
        web_app: { url: `${webAppUrl}?service=${service.id}` },
      },
    ];
  });

  return sendTelegramMessage(
    botToken,
    chatId,
    "📋 <b>Наши услуги:</b>\n\nВыберите услугу:",
    {
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
) {
  const url = `${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
  return response.json();
}

export async function setBotCommands(
  botToken: string,
  commands: Array<{ command: string; description: string }>
) {
  const url = `${TELEGRAM_API}/bot${botToken}/setMyCommands`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ commands }),
  });
  return response.json();
}

export async function setWebhook(
  botToken: string,
  webhookUrl: string
) {
  const url = `${TELEGRAM_API}/bot${botToken}/setWebhook`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  return response.json();
}

export async function getWebhookInfo(botToken: string) {
  const url = `${TELEGRAM_API}/bot${botToken}/getWebhookInfo`;
  const response = await fetch(url);
  return response.json();
}
