import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";

export type MessengerSource = "telegram" | "max";

export interface MessengerCustomer {
  source: MessengerSource;
  messengerId: string;
  firstName?: string;
}

export type VerifyCustomerResult =
  | { ok: true; customer: MessengerCustomer }
  | { ok: false; status: number; error: string };

// Verifies a Telegram / MAX mini-app customer by initData signed with the
// business bot token. The returned messenger id is trustworthy.
export function verifyMessengerCustomer(
  business: { bot_token?: string | null; max_bot_token?: string | null },
  platform: MessengerSource,
  initData: string
): VerifyCustomerResult {
  const isMax = platform === "max";
  const botToken = isMax ? business.max_bot_token : business.bot_token;
  if (!botToken) {
    return {
      ok: false,
      status: 403,
      error: isMax ? "У бизнеса не подключён MAX-бот" : "У бизнеса не подключён Telegram-бот",
    };
  }
  if (!initData) {
    return { ok: false, status: 401, error: "Откройте приложение из мессенджера." };
  }
  const verification = isMax
    ? verifyMaxInitData(initData, botToken)
    : verifyInitData(initData, botToken);
  if (!verification.valid) {
    return {
      ok: false,
      status: 401,
      error: "Сессия устарела. Закройте и снова откройте приложение.",
    };
  }
  const id = verification.user?.id;
  if (!id) {
    return { ok: false, status: 401, error: "Не удалось определить пользователя" };
  }
  return {
    ok: true,
    customer: {
      source: platform,
      messengerId: String(id),
      firstName: verification.user?.first_name,
    },
  };
}
