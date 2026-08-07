import { createHmac, createHash } from "crypto";

export interface VerifiedTelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

// Parses initData string into a map
export function parseInitData(initData: string): Record<string, string> {
  const params: Record<string, string> = {};
  const searchParams = new URLSearchParams(initData);
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

// Computes the HMAC-SHA256 signature over the data-check-string
function computeHash(initData: string, botToken: string): string {
  // secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  // data_check_string: key=value pairs (excluding hash) sorted by key
  const params = parseInitData(initData);
  const dataCheckString = Object.keys(params)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return createHash("sha256").update(aBuf).digest() === createHash("sha256").update(bBuf).digest();
}

export interface VerifyResult {
  valid: boolean;
  user?: VerifiedTelegramUser;
  error?: string;
}

// Verifies Telegram WebApp initData against the business bot token.
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): VerifyResult {
  if (!initData || !botToken) {
    return { valid: false, error: "Missing initData or bot token" };
  }

  const params = parseInitData(initData);
  const receivedHash = params.hash;
  if (!receivedHash) {
    return { valid: false, error: "Missing hash in initData" };
  }

  // Reject stale initData to prevent replay attacks
  const authDate = Number(params.auth_date);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { valid: false, error: "initData is expired" };
  }

  const expectedHash = computeHash(initData, botToken);
  if (!safeCompare(expectedHash, receivedHash)) {
    return { valid: false, error: "Invalid initData signature" };
  }

  let user: VerifiedTelegramUser | undefined;
  try {
    user = params.user ? JSON.parse(params.user) : undefined;
  } catch {
    user = undefined;
  }

  return { valid: true, user };
}
