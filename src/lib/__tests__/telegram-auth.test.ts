import { createHmac } from "crypto";
import { describe, it, expect } from "vitest";
import { verifyInitData } from "@/lib/telegram-auth";
import { verifyMaxInitData } from "@/lib/max-auth";

const BOT_TOKEN = "123456:TEST-BOT-TOKEN";

// Builds a correctly signed initData string, mirroring telegram-auth.
function sign(params: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.keys(params)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return new URLSearchParams({ ...params, hash }).toString();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe("verifyInitData", () => {
  it("accepts fresh, correctly signed initData", () => {
    const initData = sign({
      auth_date: String(nowSeconds()),
      user: JSON.stringify({ id: 42, first_name: "Ann" }),
    });

    const result = verifyInitData(initData, BOT_TOKEN);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(42);
  });

  it("rejects initData older than the max age (replay protection)", () => {
    const initData = sign({
      auth_date: String(nowSeconds() - 25 * 60 * 60),
      user: JSON.stringify({ id: 42 }),
    });

    const result = verifyInitData(initData, BOT_TOKEN);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects initData without auth_date", () => {
    const initData = sign({ user: JSON.stringify({ id: 42 }) });

    const result = verifyInitData(initData, BOT_TOKEN);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/auth_date/i);
  });

  it("rejects an unreasonably future auth_date", () => {
    const initData = sign({
      auth_date: String(nowSeconds() + 3600),
      user: JSON.stringify({ id: 42 }),
    });

    const result = verifyInitData(initData, BOT_TOKEN);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/future/i);
  });

  it("tolerates a small clock skew in the future", () => {
    const initData = sign({
      auth_date: String(nowSeconds() + 10),
      user: JSON.stringify({ id: 42 }),
    });

    expect(verifyInitData(initData, BOT_TOKEN).valid).toBe(true);
  });

  it("rejects a tampered hash", () => {
    const initData = sign({
      auth_date: String(nowSeconds()),
      user: JSON.stringify({ id: 42 }),
    });
    const tampered = initData.replace(/hash=[0-9a-f]+/, "hash=" + "0".repeat(64));

    const result = verifyInitData(tampered, BOT_TOKEN);

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });

  it("rejects a signature made with a different bot token", () => {
    const initData = sign(
      { auth_date: String(nowSeconds()), user: JSON.stringify({ id: 42 }) },
      "999:OTHER-TOKEN"
    );

    expect(verifyInitData(initData, BOT_TOKEN).valid).toBe(false);
  });
});

describe("verifyMaxInitData", () => {
  it("applies the same freshness check to MAX initData", () => {
    const fresh = sign({
      auth_date: String(nowSeconds()),
      user: JSON.stringify({ id: 7 }),
    });
    const stale = sign({
      auth_date: String(nowSeconds() - 25 * 60 * 60),
      user: JSON.stringify({ id: 7 }),
    });

    expect(verifyMaxInitData(fresh, BOT_TOKEN).valid).toBe(true);
    expect(verifyMaxInitData(stale, BOT_TOKEN).valid).toBe(false);
  });
});
