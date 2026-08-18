import https from "https";
import { MAX_CA_ROOT_PEM } from "@/lib/max-ca";

const MAX_API = "https://platform-api2.max.ru";

// The MAX Bot API is served under a certificate chain that terminates at the
// Russian state root CA (Минцифры), which Node.js does not trust by default.
// Use a dedicated agent that trusts that root (see max-ca.ts).
const MAX_HTTPS_AGENT = new https.Agent({ ca: MAX_CA_ROOT_PEM });

export type MaxButtonType =
  | "callback"
  | "link"
  | "open_app"
  | "message"
  | "clipboard";

export interface MaxButton {
  text: string;
  type: MaxButtonType;
  url?: string;
  payload?: string;
  web_app?: string;
  contact_id?: number;
}

export interface MaxUpdateUser {
  user_id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  name?: string;
  is_bot?: boolean;
  avatar_url?: string;
}

export interface MaxCallback {
  timestamp?: number;
  callback_id: string;
  payload?: string;
  user?: MaxUpdateUser;
}

export interface MaxMessageBody {
  mid: string;
  seq?: number;
  text?: string;
  attachments?: unknown[];
}

export interface MaxMessage {
  sender?: MaxUpdateUser;
  recipient?: { chat_id?: number; chat_type?: string; user_id?: number };
  timestamp?: number;
  body?: MaxMessageBody;
}

export interface MaxUpdate {
  timestamp?: number;
  chat_id?: number;
  user_id?: number;
  update_type?: string;
  message_id?: string;
  user?: MaxUpdateUser;
  message?: MaxMessage;
  callback?: MaxCallback;
  payload?: string;
}

export interface MaxBotInfo {
  user_id: number;
  first_name?: string;
  username?: string;
  is_bot?: boolean;
  description?: string;
  avatar_url?: string;
  full_avatar_url?: string;
}

export interface MaxSendMessageResult {
  message?: MaxMessage;
}

export interface MaxSimpleResult {
  message?: string;
  success?: boolean;
}

async function request(
  botToken: string,
  method: string,
  path: string,
  query?: Record<string, string | number>,
  body?: unknown
): Promise<unknown> {
  const url = new URL(`${MAX_API}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  const { status, text } = await new Promise<{ status: number; text: string }>(
    (resolve, reject) => {
      const req = https.request(
        url,
        {
          method,
          agent: MAX_HTTPS_AGENT,
          headers: {
            Authorization: botToken,
            ...(payload !== undefined
              ? { "Content-Type": "application/json; charset=utf-8" }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    }
  );

  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (status < 200 || status >= 300) {
    const detail =
      (data as { message?: string })?.message ||
      (data as { description?: string })?.description ||
      `MAX API error ${status}`;
    throw new Error(detail);
  }

  return data;
}

export async function getMaxBotInfo(
  botToken: string
): Promise<MaxBotInfo> {
  return (await request(botToken, "GET", "/me")) as MaxBotInfo;
}

export async function setMaxCommands(
  botToken: string,
  commands: Array<{ name: string; description: string }>
): Promise<MaxSimpleResult> {
  return (await request(botToken, "PATCH", "/me/commands", undefined, {
    commands,
  })) as MaxSimpleResult;
}

export async function sendMaxMessage(
  botToken: string,
  userId: number,
  text: string,
  buttons?: MaxButton[][]
): Promise<MaxSendMessageResult> {
  const body: Record<string, unknown> = { text };
  if (buttons && buttons.length > 0) {
    body.attachments = [
      {
        type: "inline_keyboard",
        payload: { buttons },
      },
    ];
  }
  return (await request(botToken, "POST", "/messages", { user_id: userId }, body)) as MaxSendMessageResult;
}

export async function answerMaxCallback(
  botToken: string,
  callbackId: string,
  notification?: string
): Promise<MaxSimpleResult> {
  return (await request(botToken, "POST", "/answers", { callback_id: callbackId }, {
    notification,
  })) as MaxSimpleResult;
}

export async function subscribeMaxWebhook(
  botToken: string,
  url: string,
  secret: string
): Promise<MaxSimpleResult> {
  return (await request(botToken, "POST", "/subscriptions", undefined, {
    url,
    secret,
    update_types: ["bot_started", "message_created", "message_callback"],
    version: "v2",
  })) as MaxSimpleResult;
}

export async function unsubscribeMaxWebhook(
  botToken: string,
  url: string
): Promise<MaxSimpleResult> {
  return (await request(botToken, "DELETE", "/subscriptions", { url })) as MaxSimpleResult;
}

export async function getMaxSubscriptions(
  botToken: string
): Promise<{ subscriptions?: Array<{ url: string }> }> {
  return (await request(botToken, "GET", "/subscriptions")) as {
    subscriptions?: Array<{ url: string }>;
  };
}

// --- Button helpers ---

export function maxCallbackButton(text: string, payload: string): MaxButton {
  return { type: "callback", text, payload };
}

export function maxLinkButton(text: string, url: string): MaxButton {
  return { type: "link", text, url };
}

export function maxOpenAppButton(
  text: string,
  webAppName: string,
  payload?: string
): MaxButton {
  return { type: "open_app", text, web_app: webAppName, payload };
}

// --- Update helpers ---

export function getMaxUserId(update: MaxUpdate): number | undefined {
  if (update.callback) {
    return update.callback.user?.user_id ?? update.user_id;
  }
  if (update.message) {
    return update.message.sender?.user_id ?? update.message.recipient?.user_id ?? update.user_id;
  }
  return update.user?.user_id ?? update.user_id;
}
