import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTelegramMessage: vi.fn(),
  sendMaxMessage: vi.fn(),
}));

vi.mock("@/lib/telegram-bot", () => ({
  sendTelegramMessage: mocks.sendTelegramMessage,
}));
vi.mock("@/lib/max-bot", () => ({
  sendMaxMessage: mocks.sendMaxMessage,
}));

import { notifyOwner, escapeHtml } from "@/lib/notify-owner";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("escapeHtml", () => {
  it("escapes only the entities Telegram supports (<, >, &)", () => {
    expect(escapeHtml(`<b>&"quote"</b>`)).toBe(
      `&lt;b&gt;&amp;"quote"&lt;/b&gt;`
    );
  });
});

describe("notifyOwner", () => {
  it("sends to both channels when fully configured", async () => {
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    const results = await notifyOwner(
      {
        bot_token: "tg-token",
        telegram_notify_chat_id: "123",
        max_bot_token: "max-token",
        max_notify_user_id: "456",
      },
      "🔔 Новая запись!"
    );

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      "tg-token",
      123,
      "🔔 Новая запись!"
    );
    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      "max-token",
      456,
      "🔔 Новая запись!"
    );
    expect(results).toEqual([
      { channel: "telegram", status: "sent" },
      { channel: "max", status: "sent" },
    ]);
  });

  it("escapes the message for Telegram but sends it raw to MAX", async () => {
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    await notifyOwner(
      {
        bot_token: "tg-token",
        telegram_notify_chat_id: "123",
        max_bot_token: "max-token",
        max_notify_user_id: "456",
      },
      "Клиент: <Иван> & \"партнёр\""
    );

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      "tg-token",
      123,
      "Клиент: &lt;Иван&gt; &amp; \"партнёр\""
    );
    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      "max-token",
      456,
      "Клиент: <Иван> & \"партнёр\""
    );
  });

  it("reports Telegram skipped when bot_token is missing", async () => {
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    const results = await notifyOwner(
      { max_bot_token: "max-token", max_notify_user_id: "456" },
      "🔔 Новая запись!"
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      channel: "telegram",
      status: "skipped",
      reason: "bot_token is not set",
    });
    expect(results[1]).toEqual({ channel: "max", status: "sent" });
  });

  it("reports Telegram skipped when the chat id is not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    const results = await notifyOwner(
      { bot_token: "tg-token", max_bot_token: "max-token", max_notify_user_id: "456" },
      "🔔 Новая запись!"
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      channel: "telegram",
      status: "skipped",
      reason: "telegram_notify_chat_id is not set",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reports MAX skipped when the user id is not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });

    const results = await notifyOwner(
      { bot_token: "tg-token", telegram_notify_chat_id: "123", max_bot_token: "max-token" },
      "🔔 Новая запись!"
    );

    expect(mocks.sendMaxMessage).not.toHaveBeenCalled();
    expect(results[1]).toMatchObject({
      channel: "max",
      status: "skipped",
      reason: "max_notify_user_id is not set",
    });
    warn.mockRestore();
  });

  it("sends nothing and reports skips when no channel is configured", async () => {
    const results = await notifyOwner({}, "🔔 Новая запись!");
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    expect(mocks.sendMaxMessage).not.toHaveBeenCalled();
    expect(results.map((r) => r.status)).toEqual(["skipped", "skipped"]);
  });

  it("reports Telegram failed when it answers with ok:false", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockResolvedValue({
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    });

    const results = await notifyOwner(
      { bot_token: "tg-token", telegram_notify_chat_id: "123" },
      "test"
    );

    expect(results[0]).toMatchObject({
      channel: "telegram",
      status: "failed",
      reason: "Bad Request: chat not found",
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not reject when a sender throws; reports failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockRejectedValue(new Error("network"));
    mocks.sendMaxMessage.mockRejectedValue(new Error("network"));

    const results = await notifyOwner(
      {
        bot_token: "tg-token",
        telegram_notify_chat_id: "123",
        max_bot_token: "max-token",
        max_notify_user_id: "456",
      },
      "test"
    );

    expect(results.map((r) => r.status)).toEqual(["failed", "failed"]);
    expect(results[0].reason).toBe("network");
    expect(results[1].reason).toBe("network");
    error.mockRestore();
  });
});
