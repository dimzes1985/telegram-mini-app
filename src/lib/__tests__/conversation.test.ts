import { describe, it, expect } from "vitest";
import {
  trimConversationHistory,
  HISTORY_MAX_CHARS,
  type ConversationMessage,
} from "@/lib/conversation";

function msg(role: "user" | "assistant", content: string): ConversationMessage {
  return { role, content };
}

describe("trimConversationHistory", () => {
  it("returns all messages when within the limits", () => {
    const messages = [msg("user", "hi"), msg("assistant", "hello")];
    expect(trimConversationHistory(messages, 10, 1000)).toEqual(messages);
  });

  it("drops the oldest messages beyond the count limit", () => {
    const messages = [
      msg("user", "1"),
      msg("assistant", "2"),
      msg("user", "3"),
      msg("assistant", "4"),
    ];
    expect(trimConversationHistory(messages, 2, 1000)).toEqual([
      msg("user", "3"),
      msg("assistant", "4"),
    ]);
  });

  it("trims the oldest messages to fit the character budget", () => {
    const messages = [
      msg("user", "aaaa"), // 4
      msg("assistant", "bbbb"), // 4
      msg("user", "cccc"), // 4
    ];
    // Budget fits only the last two (8 chars), not all three (12).
    expect(trimConversationHistory(messages, 10, 8)).toEqual([
      msg("assistant", "bbbb"),
      msg("user", "cccc"),
    ]);
  });

  it("keeps the latest message even if it alone exceeds the budget", () => {
    const messages = [
      msg("user", "old"),
      msg("assistant", "x".repeat(100)),
    ];
    expect(trimConversationHistory(messages, 10, 10)).toEqual([
      msg("assistant", "x".repeat(100)),
    ]);
  });

  it("returns an empty history for empty input", () => {
    expect(trimConversationHistory([], 10, 1000)).toEqual([]);
  });

  it("returns nothing when the message limit is zero", () => {
    const messages = [msg("user", "hi")];
    expect(trimConversationHistory(messages, 0, 1000)).toEqual([]);
  });

  it("defaults to a bounded context size", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `m${i}`)
    );
    const trimmed = trimConversationHistory(many);
    expect(trimmed.length).toBeLessThanOrEqual(10);
    const total = trimmed.reduce((sum, m) => sum + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(HISTORY_MAX_CHARS);
    // The most recent message is always preserved.
    expect(trimmed.at(-1)).toEqual(many.at(-1));
  });
});
