import { verifyInitData, parseInitData, type VerifyResult } from "@/lib/telegram-auth";

// MAX Bridge exposes initData as the URL-encoded "WebAppData" value.
// Depending on how it is surfaced it may arrive double-encoded
// (e.g. "chat%3D%257B...%26hash%3D..."), so try to normalize it into a
// plain key=value query string before verifying.
export function normalizeMaxInitData(initData: string): string {
  if (!initData) return initData;

  const parsed = parseInitData(initData);
  const looksComplete = parsed.hash && (parsed.user || parsed.chat);

  if (looksComplete) {
    return initData;
  }

  // Still encoded separators => decode once and re-check
  if (initData.includes("%26") || initData.includes("%3D")) {
    try {
      const decoded = decodeURIComponent(initData);
      const reparsed = parseInitData(decoded);
      if (reparsed.hash && (reparsed.user || reparsed.chat)) {
        return decoded;
      }
    } catch {
      // fall through
    }
  }

  return initData;
}

// Verifies MAX Messenger mini-app initData against the business MAX bot token.
// The signing algorithm is identical to Telegram Web Apps (HMAC-SHA256 with the
// "WebAppData" key), so we reuse the same verification routine.
export function verifyMaxInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): VerifyResult {
  return verifyInitData(normalizeMaxInitData(initData), botToken, maxAgeSeconds);
}
