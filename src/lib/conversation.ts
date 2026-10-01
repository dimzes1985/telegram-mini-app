import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationChannel = "tg" | "max";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// How many recent messages are fed back to the model as conversation history.
const HISTORY_LIMIT = 10;

// Upper bound on the total characters of history sent to the model, so bulky
// messages cannot blow up the prompt tokens or overflow the context window.
const HISTORY_MAX_CHARS = 6000;

export { HISTORY_LIMIT, HISTORY_MAX_CHARS };

// Keeps the most recent messages that fit within both the message-count and
// character budgets, dropping the oldest first. The latest message is always
// kept, even if it alone exceeds the character budget, so the model never loses
// the current turn.
export function trimConversationHistory(
  messages: ConversationMessage[],
  maxMessages: number = HISTORY_LIMIT,
  maxChars: number = HISTORY_MAX_CHARS
): ConversationMessage[] {
  if (maxMessages <= 0) return [];

  const byCount = messages.slice(-maxMessages);

  const kept: ConversationMessage[] = [];
  let total = 0;
  for (let i = byCount.length - 1; i >= 0; i--) {
    const message = byCount[i];
    if (kept.length > 0 && total + message.content.length > maxChars) break;
    total += message.content.length;
    kept.unshift(message);
  }
  return kept;
}

// Loads the most recent messages of a conversation, oldest first, so the AI
// can keep the dialog context (no re-greeting, booking details collected
// across multiple turns). The result is bounded by message count and total
// size before it is sent to the model.
export async function getConversationHistory(
  supabase: SupabaseClient,
  businessId: string,
  channel: ConversationChannel,
  channelUserId: string,
  limit: number = HISTORY_LIMIT
): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("user_id", businessId)
    .eq("channel", channel)
    .eq("channel_user_id", channelUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = data ?? [];
  const ordered = rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));

  return trimConversationHistory(ordered, limit, HISTORY_MAX_CHARS);
}

// Appends messages to the conversation log. Never throws: failing to persist
// history must not break the chat.
export async function appendConversationMessages(
  supabase: SupabaseClient,
  businessId: string,
  channel: ConversationChannel,
  channelUserId: string,
  messages: ConversationMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const { error } = await supabase.from("chat_messages").insert(
    messages.map((m) => ({
      user_id: businessId,
      channel,
      channel_user_id: channelUserId,
      role: m.role,
      content: m.content,
    }))
  );
  if (error) {
    console.error("Failed to persist conversation history:", error.message);
  }
}
