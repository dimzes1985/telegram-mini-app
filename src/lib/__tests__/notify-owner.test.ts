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
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<b>&"quote"</b>`)).toBe(
      "&lt;b&gt;&amp;&quot;quote&quot;&lt;/b&gt;"
    );
  });
});

describe("notifyOwner", () => {
  it("sends to both channels when fully configured", async () => {
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    await notifyOwner(
      {
        bot_token: "tg-token",
        telegram_notify_chat_id: "123",
        max_bot_token: "max-token",
        max_notify_user_id: "456",
      },
      "🔔 Новая запись!"
    );

    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      "tg-token",
      123,
      "🔔 Новая запись!"
    );
    expect(mocks.sendMaxMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      "max-token",
      456,
      "🔔 Новая запись!"
    );
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
      "Клиент: <Иван> & партнёр"
    );

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      "tg-token",
      123,
      "Клиент: &lt;Иван&gt; &amp; партнёр"
    );
    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      "max-token",
      456,
      "Клиент: <Иван> & партнёр"
    );
  });

  it("skips Telegram when the chat id is not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.sendMaxMessage.mockResolvedValue({ success: true });

    await notifyOwner(
      { bot_token: "tg-token", max_bot_token: "max-token", max_notify_user_id: "456" },
      "🔔 Новая запись!"
    );

    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    expect(mocks.sendMaxMessage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips MAX when the user id is not set", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockResolvedValue({ ok: true });

    await notifyOwner(
      { bot_token: "tg-token", telegram_notify_chat_id: "123", max_bot_token: "max-token" },
      "🔔 Новая запись!"
    );

    expect(mocks.sendMaxMessage).not.toHaveBeenCalled();
    expect(mocks.sendTelegramMessage).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("sends nothing when no channel is configured", async () => {
    await notifyOwner({}, "🔔 Новая запись!");
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
    expect(mocks.sendMaxMessage).not.toHaveBeenCalled();
  });

  it("does not reject when Telegram answers with ok:false", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockResolvedValue({
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    });

    await expect(
      notifyOwner({ bot_token: "tg-token", telegram_notify_chat_id: "123" }, "test")
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not reject when a sender throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendTelegramMessage.mockRejectedValue(new Error("network"));
    mocks.sendMaxMessage.mockRejectedValue(new Error("network"));

    await expect(
      notifyOwner(
        {
          bot_token: "tg-token",
          telegram_notify_chat_id: "123",
          max_bot_token: "max-token",
          max_notify_user_id: "456",
        },
        "test"
      )
    ).resolves.toBeUndefined();
    error.mockRestore();
  });
});
