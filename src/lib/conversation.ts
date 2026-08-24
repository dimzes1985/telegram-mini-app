import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationChannel = "tg" | "max";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// How many recent messages are fed back to the model as conversation history.
const HISTORY_LIMIT = 10;

// Loads the most recent messages of a conversation, oldest first, so the AI
// can keep the dialog context (no re-greeting, booking details collected
// across multiple turns).
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
  return rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
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
