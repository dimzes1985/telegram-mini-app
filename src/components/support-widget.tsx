"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, UserRound, X } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "handoff" | "setup" | "sent";

const TELEGRAM_URL = "https://t.me/DmitrKuleshov";
const GREETING: Msg = {
  role: "assistant",
  content:
    "Здравствуйте! Я консультант Slot 🤖 Расскажу про запись клиентов в Telegram и MAX, тарифы и подключение. Что вас интересует?",
};
const SUGGESTIONS = ["Сколько стоит?", "Как подключить?", "Есть пробный период?", "Подойдёт для стоматологии?"];
const NICHES = ["Салон красоты", "Маникюр / ресницы / брови", "Барбершоп", "Стоматология", "Массаж / косметология", "Другое"];

// Opens the widget from anywhere: openSupport("setup").
export function openSupport(mode: "chat" | "setup" = "chat") {
  window.dispatchEvent(new CustomEvent("slot-support", { detail: mode }));
}

const inputCls =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", niche: "", message: "", consent: false, website: "" });
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = (e as CustomEvent).detail === "setup" ? "setup" : "chat";
      setOpen(true);
      setMode(m);
      reachGoal(m === "setup" ? "setup_open" : "chat_open");
    };
    window.addEventListener("slot-support", onOpen);
    return () => window.removeEventListener("slot-support", onOpen);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, showHandoff]);

  const toggle = () => {
    if (!open) reachGoal("chat_open");
    setOpen(!open);
  };

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    const next = [...messages, { role: "user" as const, content: q.slice(0, 800) }];
    setMessages(next);
    setInput("");
    setThinking(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      });
      const data = await res.json().catch(() => ({}));
      setMessages([...next, { role: "assistant", content: data.reply || "Не получилось ответить. Передайте вопрос Дмитрию." }]);
      if (data.handoff || !res.ok) setShowHandoff(true);
    } catch {
      setMessages([...next, { role: "assistant", content: "Нет связи. Попробуйте ещё раз или напишите Дмитрию в Telegram." }]);
      setShowHandoff(true);
    } finally {
      setThinking(false);
    }
  };

  const startHandoff = () => {
    const questions = messages.filter((m) => m.role === "user").map((m) => m.content);
    setForm((f) => ({ ...f, message: f.message || questions.slice(-3).join("\n") }));
    setMode("handoff");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.consent) return setFormError("Отметьте согласие на обработку данных");
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: mode === "setup" ? "setup" : "chat",
          name: form.name,
          contact: form.contact,
          niche: mode === "setup" ? form.niche || undefined : undefined,
          message: form.message || undefined,
          consent: true,
          website: form.website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "Не удалось отправить");
        return;
      }
      reachGoal("lead_sent", { kind: mode });
      setMode("sent");
    } catch {
      setFormError("Нет связи. Напишите Дмитрию в Telegram.");
    } finally {
      setSending(false);
    }
  };

  const leadForm = (
    <form onSubmit={submit} className="space-y-3 p-4">
      <p className="text-sm text-gray-700">
        {mode === "setup"
          ? "Оставьте контакт — Дмитрий свяжется, поможет создать бота и добавит ваши услуги. Бесплатно."
          : "Дмитрий ответит лично — обычно в течение рабочего дня."}
      </p>
      <input required maxLength={200} placeholder="Ваше имя" value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
      <input required maxLength={200} placeholder="Телефон или Telegram" value={form.contact}
        onChange={(e) => setForm({ ...form, contact: e.target.value })} className={inputCls} />
      {mode === "setup" ? (
        <select value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} className={inputCls}>
          <option value="">Сфера бизнеса</option>
          {NICHES.map((n) => <option key={n}>{n}</option>)}
        </select>
      ) : (
        <textarea required rows={3} maxLength={2000} placeholder="Ваш вопрос" value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
      )}
      {/* Honeypot for bots */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-2 text-xs leading-snug text-gray-600">
        <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-blue-600" />
        <span>
          Согласен на обработку персональных данных по{" "}
          <a href="/privacy" target="_blank" className="text-blue-600 underline">политике конфиденциальности</a>
        </span>
      </label>
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <button type="submit" disabled={sending}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {mode === "setup" ? "Оставить заявку" : "Отправить Дмитрию"}
      </button>
      {mode === "handoff" && (
        <button type="button" onClick={() => setMode("chat")} className="w-full text-center text-xs text-gray-500 hover:text-gray-800">
          ← Вернуться к чату
        </button>
      )}
    </form>
  );

  return (
    <>
      {!open && (
        <button onClick={toggle} aria-label="Задать вопрос"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 sm:bottom-6 sm:right-6">
          <MessageCircle className="h-5 w-5" />
          Задать вопрос
        </button>
      )}
      {open && (
        <div className="fixed inset-x-2 bottom-2 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              {mode === "chat" ? <MessageCircle className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {mode === "setup" ? "Настроим за вас бесплатно" : mode === "chat" ? "Консультант Slot" : "Вопрос Дмитрию"}
              </p>
              <p className="text-xs text-blue-100">
                {mode === "chat" ? "ИИ-помощник · отвечает сразу" : "Основатель Slot · ответит лично"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="rounded-full p-1 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>

          {mode === "sent" ? (
            <div className="space-y-3 p-6 text-center">
              <p className="text-3xl">✅</p>
              <p className="font-semibold text-gray-900">Отправлено!</p>
              <p className="text-sm text-gray-600">Дмитрий свяжется с вами в ближайшее время.</p>
              <button onClick={() => setMode("chat")} className="text-sm text-blue-600 hover:underline">
                Вернуться к чату
              </button>
            </div>
          ) : mode === "chat" ? (
            <>
              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4" style={{ minHeight: 280 }}>
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-white text-gray-800 shadow-sm"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Печатает…
                  </div>
                )}
                {messages.length === 1 && (
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => ask(s)}
                        className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-blue-700 hover:bg-blue-50">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {showHandoff && !thinking && (
                  <button onClick={startHandoff}
                    className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
                    👤 Передать вопрос Дмитрию
                  </button>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2 border-t p-3">
                <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={800}
                  placeholder="Напишите вопрос…" className={inputCls} />
                <button type="submit" disabled={thinking || !input.trim()} aria-label="Отправить"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-50">
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="flex items-center justify-between gap-2 px-3 pb-3 text-[11px] text-gray-500">
                <span>Не пишите в чат телефон и личные данные</span>
                <span className="flex gap-3">
                  {!showHandoff && (
                    <button onClick={startHandoff} className="text-blue-600 hover:underline">Живой человек</button>
                  )}
                  <a href={TELEGRAM_URL} target="_blank" rel="noopener" className="text-blue-600 hover:underline">Telegram</a>
                </span>
              </div>
            </>
          ) : (
            <div className="overflow-y-auto">
              {leadForm}
              <p className="px-4 pb-4 text-center text-xs text-gray-500">
                Или напишите напрямую:{" "}
                <a href={TELEGRAM_URL} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                  @DmitrKuleshov в Telegram
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
