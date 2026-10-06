"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { openLegalLink } from "@/components/legal/consent-checkbox";
import { Input } from "@/components/ui/input";
import { useMessenger } from "@/lib/messenger";
import { Send } from "lucide-react";

interface ChatInterfaceProps {
  businessId: string;
}

// Human-readable reason why the assistant did not answer. The server replies
// with JSON { error } and an HTTP status; useChat puts the body in message.
function chatErrorText(error: Error, inMessenger: boolean): string {
  const raw = error.message || "";
  if (!inMessenger || /initData/i.test(raw)) {
    return "Чат с AI-ассистентом работает внутри Telegram или MAX. Откройте приложение через бота или запишитесь на вкладке «Запись».";
  }
  if (/limit|Too many/i.test(raw)) {
    return "Слишком много сообщений. Подождите минуту и попробуйте снова.";
  }
  if (/no (MAX )?bot configured/i.test(raw)) {
    return "Чат пока не настроен владельцем. Запишитесь на вкладке «Запись».";
  }
  return "AI-ассистент сейчас не отвечает. Попробуйте ещё раз чуть позже или запишитесь на вкладке «Запись».";
}

export function ChatInterface({ businessId }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const { webApp, initData, platform } = useMessenger();

  // The messenger (Telegram / MAX) is detected asynchronously, so initData is
  // empty on the first render, and useChat keeps the transport from its first
  // render. The auth fields are therefore passed with every sendMessage call
  // (always the current values) instead of being baked into the transport;
  // otherwise every message went out without initData and was rejected (401).
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat" }));

  const { messages, sendMessage, status, error, clearError } = useChat({
    transport,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (error) clearError();
    webApp.HapticFeedback.impactOccurred("light");
    sendMessage({ text: input }, { body: { businessId, initData, platform } });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg font-medium">Добро пожаловать!</p>
            <p className="text-sm">Спросите что-нибудь о наших услугах.</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-900"
              }`}
            >
              {message.parts?.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.text}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        {error && !isLoading && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {chatErrorText(error, Boolean(initData))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Введите сообщение..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-center text-[11px] leading-snug text-gray-400">
          Отправляя сообщения, вы даёте{" "}
          <a href="/consent" target="_blank" rel="noopener" className="underline" onClick={openLegalLink}>
            согласие на обработку персональных данных
          </a>
        </p>
      </div>
    </div>
  );
}
