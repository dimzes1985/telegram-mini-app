"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Bot, ExternalLink, CheckCircle, Bell } from "lucide-react";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Понедельник",
  tuesday: "Вторник",
  wednesday: "Среда",
  thursday: "Четверг",
  friday: "Пятница",
  saturday: "Суббота",
  sunday: "Воскресенье",
};

const DEFAULT_WORKING_HOURS: Record<string, WorkingHoursDay> = {
  monday: { start: "09:00", end: "18:00", enabled: true },
  tuesday: { start: "09:00", end: "18:00", enabled: true },
  wednesday: { start: "09:00", end: "18:00", enabled: true },
  thursday: { start: "09:00", end: "18:00", enabled: true },
  friday: { start: "09:00", end: "18:00", enabled: true },
  saturday: { start: "10:00", end: "14:00", enabled: false },
  sunday: { start: "10:00", end: "14:00", enabled: false },
};

export default function SettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [workingHours, setWorkingHours] = useState<Record<string, WorkingHoursDay>>(DEFAULT_WORKING_HOURS);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [botTokenSet, setBotTokenSet] = useState(false);
  const [botWebhookSet, setBotWebhookSet] = useState(false);
  const [botTokenValid, setBotTokenValid] = useState(true);
  const [botWebhookUrl, setBotWebhookUrl] = useState("");
  const [botWebhookLastError, setBotWebhookLastError] = useState("");
  const [maxBotToken, setMaxBotToken] = useState("");
  const [maxBotUsername, setMaxBotUsername] = useState("");
  const [maxBotTokenSet, setMaxBotTokenSet] = useState(false);
  const [maxBotWebhookSet, setMaxBotWebhookSet] = useState(false);
  const [telegramNotifyChatId, setTelegramNotifyChatId] = useState("");
  const [maxNotifyUserId, setMaxNotifyUserId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingUpBot, setSettingUpBot] = useState(false);
  const [settingUpMaxBot, setSettingUpMaxBot] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [botError, setBotError] = useState("");
  const [maxBotError, setMaxBotError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [plan, setPlan] = useState("free");
  const [aiUsage, setAiUsage] = useState<{ plan: string; used: number; limit: number; remaining: number } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name || "");
        setBusinessId(data.id || "");
        setBusinessDescription(data.business_description || "");
        setBusinessAddress(data.business_address || "");
        setBusinessPhone(data.business_phone || "");
        setBusinessEmail(data.business_email || "");
        setSystemPrompt(data.system_prompt || "");
        if (data.working_hours) {
          setWorkingHours(data.working_hours);
        }
        setBotTokenSet(data.bot_token_set || false);
        setBotUsername(data.bot_username || "");
        setMaxBotTokenSet(data.max_bot_token_set || false);
        setMaxBotUsername(data.max_bot_username || "");
        setMaxBotWebhookSet(data.max_bot_webhook_set || false);
        setTelegramNotifyChatId(data.telegram_notify_chat_id || "");
        setMaxNotifyUserId(data.max_notify_user_id || "");
        setPlan(data.plan || "free");
        setAiUsage(data.ai_usage || null);
        setLoading(false);
      });

    // Check bot webhook status
    fetch("/api/bot/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          setBotUsername(data.username || "");
          setBotWebhookSet(data.webhook_set || false);
          setBotTokenValid(data.token_valid !== false);
          setBotWebhookUrl(data.webhook_info?.url || "");
          setBotWebhookLastError(
            data.webhook_info?.last_error_message || ""
          );
        }
      });

    // Check MAX bot status
    fetch("/api/max/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          setMaxBotUsername(data.username || "");
          setMaxBotWebhookSet(data.webhook_set || data.subscription_active || false);
        }
      });
  }, []);

  const refreshBotStatus = async () => {
    try {
      const res = await fetch("/api/bot/setup");
      const data = await res.json();
      if (data.configured) {
        setBotUsername(data.username || "");
        setBotWebhookSet(data.webhook_set || false);
        setBotTokenValid(data.token_valid !== false);
        setBotWebhookUrl(data.webhook_info?.url || "");
        setBotWebhookLastError(
          data.webhook_info?.last_error_message || ""
        );
      }
    } catch {
      // ignore, status stays as-is
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setBotError("");
    setMaxBotError("");
    setSaveError("");

    const updateData: Record<string, unknown> = {
      business_name: businessName,
      business_description: businessDescription,
      business_address: businessAddress,
      business_phone: businessPhone,
      business_email: businessEmail,
      system_prompt: systemPrompt,
      working_hours: workingHours,
      telegram_notify_chat_id: telegramNotifyChatId || null,
      max_notify_user_id: maxNotifyUserId || null,
    };

    // Only include bot_token if user entered a new one
    if (botToken && !botToken.startsWith("••••")) {
      updateData.bot_token = botToken;
    }

    // Only include max_bot_token if user entered a new one
    if (maxBotToken && !maxBotToken.startsWith("••••")) {
      updateData.max_bot_token = maxBotToken;
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveError(data.error || `Ошибка сохранения (HTTP ${res.status})`);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // A newly saved token resets the webhook flag on the server; refresh
        // so the "Настроить вебхук" button shows immediately.
        await refreshBotStatus();
      }
    } catch {
      setSaveError("Ошибка соединения при сохранении");
    }

    setSaving(false);
  };

  const handleSetupBot = async () => {
    setSettingUpBot(true);
    setBotError("");

    try {
      const res = await fetch("/api/bot/setup", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setBotWebhookSet(true);
      } else {
        setBotError(data.error || "Не удалось настроить бота");
      }
    } catch {
      setBotError("Ошибка соединения");
    }

    await refreshBotStatus();
    setSettingUpBot(false);
  };

  const handleSetupMaxBot = async () => {
    setSettingUpMaxBot(true);
    setMaxBotError("");

    try {
      const res = await fetch("/api/max/setup", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setMaxBotWebhookSet(true);
        if (data.username) setMaxBotUsername(data.username);
      } else {
        setMaxBotError(data.error || "Не удалось настроить MAX-бота");
      }
    } catch {
      setMaxBotError("Ошибка соединения");
    }

    setSettingUpMaxBot(false);
  };

  const updateDay = (day: string, field: keyof WorkingHoursDay, value: string | boolean) => {
    setWorkingHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    setNotificationTestResult(null);

    let res: Response | null = null;
    try {
      res = await fetch("/api/notifications/test", { method: "POST" });
      const raw = await res.text();
      let data: { success?: boolean; error?: string; channels?: Array<{ channel: string; status: string; reason?: string }> } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // non-JSON body (e.g. an HTML error page) - handled below
      }

      const channels = data.channels || [];
      if (channels.length > 0) {
        const labels: Record<string, string> = {
          telegram: "Telegram",
          max: "MAX",
        };
        const lines = channels.map((c) => {
          const name = labels[c.channel] || c.channel;
          if (c.status === "sent") return `${name}: отправлено`;
          if (c.status === "skipped")
            return `${name}: пропущено (${c.reason || "не настроен"})`;
          return `${name}: ошибка (${c.reason || "неизвестно"})`;
        });
        setNotificationTestResult({
          ok: data.success === true,
          message: lines.join(" · "),
        });
        return;
      }

      if (data.error) {
        setNotificationTestResult({ ok: false, message: data.error });
        return;
      }

      if (!res.ok || !data.success) {
        setNotificationTestResult({
          ok: false,
          message: `Сервер ответил: ${res.status} ${res.statusText}${
            raw ? ` — ${raw.slice(0, 200)}` : ""
          }`,
        });
        return;
      }

      setNotificationTestResult({
        ok: true,
        message: "Уведомление отправлено",
      });
    } catch {
      setNotificationTestResult({
        ok: false,
        message: res
          ? `Ошибка соединения (HTTP ${res.status})`
          : "Ошибка соединения — не удалось обратиться к серверу",
      });
    } finally {
      setTestingNotification(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Загрузка...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Настройки</h1>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Информация о бизнесе</CardTitle>
            <CardDescription>
              Эта информация показывается вашим клиентам.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="businessName">Название бизнеса</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Название вашего бизнеса"
              />
            </div>
            <div>
              <Label htmlFor="businessDescription">Описание</Label>
              <Textarea
                id="businessDescription"
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                placeholder="Краткое описание для клиентов (например: «Салон красоты в центре города»)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="businessAddress">Адрес</Label>
              <Input
                id="businessAddress"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="Улица, дом, город"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="businessPhone">Телефон</Label>
                <Input
                  id="businessPhone"
                  type="tel"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+7 (900) 000-00-00"
                />
              </div>
              <div>
                <Label htmlFor="businessEmail">Почта</Label>
                <Input
                  id="businessEmail"
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="info@business.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Телеграм-бот
            </CardTitle>
            <CardDescription>
              Подключите своего Телеграм-бота, чтобы клиенты могли записываться прямо из Telegram.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="botToken">Токен бота</Label>
              <div className="flex gap-2">
                <Input
                  id="botToken"
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={botTokenSet ? "••••••••" : "Введите токен от @BotFather"}
                />
                {botTokenSet && (
                  <Badge variant="secondary" className="whitespace-nowrap">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Установлен
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Получите токен у{" "}
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-1"
                >
                  @BotFather <ExternalLink className="h-3 w-3" />
                </a>{" "}
                в Telegram
              </p>
            </div>

            {botUsername && (
              <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Бот:</span> @{botUsername}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Вебхук:</span>{" "}
                  {botWebhookSet ? (
                    <span className="text-green-600">Активен</span>
                  ) : (
                    <span className="text-red-600">Не настроен</span>
                  )}
                </p>
                {botWebhookUrl && (
                  <p className="text-sm break-all">
                    <span className="font-medium">URL вебхука:</span>{" "}
                    <span className="text-gray-600">{botWebhookUrl}</span>
                  </p>
                )}
                {botWebhookLastError && (
                  <p className="text-sm text-red-600">
                    <span className="font-medium">Ошибка Telegram:</span>{" "}
                    {botWebhookLastError}
                  </p>
                )}
              </div>
            )}

            {botTokenSet && !botTokenValid && (
              <div className="p-3 bg-red-50 rounded-lg text-red-600 text-sm">
                Сохранённый токен недействителен или был отозван в @BotFather.
                Бот не отвечает. Вставьте актуальный токен из @BotFather и
                нажмите «Сохранить настройки», затем «Настроить вебхук».
              </div>
            )}

            {botTokenSet && !botWebhookSet && (
              <Button onClick={handleSetupBot} disabled={settingUpBot}>
                {settingUpBot ? "Настройка..." : "Настроить вебхук"}
              </Button>
            )}

            {botError && (
              <p className="text-sm text-red-500">{botError}</p>
            )}

            {botWebhookSet && (
              <div className="p-3 bg-green-50 rounded-lg text-green-700 text-sm">
                Ваш бот готов! Клиенты могут общаться с ним в Telegram.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Бот MAX
            </CardTitle>
            <CardDescription>
              Подключите своего MAX-бота, чтобы клиенты могли записываться прямо в MAX Messenger.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="maxBotToken">Токен бота</Label>
              <div className="flex gap-2">
                <Input
                  id="maxBotToken"
                  type="password"
                  value={maxBotToken}
                  onChange={(e) => setMaxBotToken(e.target.value)}
                  placeholder={maxBotTokenSet ? "••••••••" : "Введите токен доступа MAX-бота"}
                />
                {maxBotTokenSet && (
                  <Badge variant="secondary" className="whitespace-nowrap">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Установлен
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Получите токен у{" "}
                <a
                  href="https://max.ru/business_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline inline-flex items-center gap-1"
                >
                  бота «MAX для бизнеса» <ExternalLink className="h-3 w-3" />
                </a>{" "}
                (команда «Получить токен») или в расширенных настройках бота на{" "}
                <a
                  href="https://business.max.ru/self"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  business.max.ru
                </a>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                После сохранения подключите мини-приложение к боту: укажите URL приложения{" "}
                <code className="text-xs bg-gray-100 px-1 rounded">
                  {`${typeof window !== "undefined" ? window.location.origin : ""}/b/${businessId || "…"}`}
                </code>{" "}
                на платформе MAX (раздел «Чат-боты» → «Расширенные настройки» → «Настроить») и выберите вид кнопки (например, «Старт»).
              </p>
            </div>

            {maxBotUsername && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Бот:</span> @{maxBotUsername}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Вебхук:</span>{" "}
                  {maxBotWebhookSet ? (
                    <span className="text-green-600">Активен</span>
                  ) : (
                    <span className="text-yellow-600">Не настроен</span>
                  )}
                </p>
              </div>
            )}

            {maxBotTokenSet && !maxBotWebhookSet && (
              <Button onClick={handleSetupMaxBot} disabled={settingUpMaxBot}>
                {settingUpMaxBot ? "Настройка..." : "Настроить вебхук"}
              </Button>
            )}

            {maxBotError && (
              <p className="text-sm text-red-500">{maxBotError}</p>
            )}

            {maxBotWebhookSet && (
              <div className="p-3 bg-green-50 rounded-lg text-green-700 text-sm">
                Ваш MAX-бот готов! Клиенты могут общаться с ним в MAX Messenger.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Уведомления о записях
            </CardTitle>
            <CardDescription>
              Владелец получит сообщение о каждой новой записи. Укажите, куда
              доставлять уведомления.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="telegramNotifyChatId">Telegram chat ID</Label>
              <Input
                id="telegramNotifyChatId"
                value={telegramNotifyChatId}
                onChange={(e) => setTelegramNotifyChatId(e.target.value)}
                placeholder="Например, 123456789"
              />
              <p className="text-sm text-gray-500 mt-1">
                Отправьте сообщение боту{" "}
                <a
                  href="https://t.me/userinfobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  @userinfobot
                </a>{" "}
                в Telegram — он пришлёт ваш личный ID (например, 123456789).
                Это ID вашего аккаунта, а не бота: Telegram запрещает ботам
                писать другим ботам. Уведомления придут от вашего
                Telegram-бота, поэтому сначала напишите ему (команда /start).
              </p>
            </div>
            <div>
              <Label htmlFor="maxNotifyUserId">MAX user ID</Label>
              <Input
                id="maxNotifyUserId"
                value={maxNotifyUserId}
                onChange={(e) => setMaxNotifyUserId(e.target.value)}
                placeholder="Например, 30876538"
              />
              <p className="text-sm text-gray-500 mt-1">
                Ваш ID в MAX Messenger. Уведомления придут от вашего MAX-бота.
              </p>
            </div>
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                onClick={handleTestNotification}
                disabled={testingNotification}
              >
                <Bell className="h-4 w-4 mr-2" />
                {testingNotification
                  ? "Отправка..."
                  : "Отправить тестовое уведомление"}
              </Button>
              {notificationTestResult && (
                <p
                  className={`text-sm mt-2 ${
                    notificationTestResult.ok ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {notificationTestResult.message}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Нажмите, чтобы проверить, что уведомления о новых записях
                доходят до Telegram и MAX. Сначала сохраните настройки.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Режим работы</CardTitle>
            <CardDescription>
              Укажите часы работы. Клиенты смогут записываться только в это время.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DAYS.map((day) => (
              <div key={day} className="flex items-center gap-4">
                <div className="w-24">
                  <Label className="text-sm font-medium">{DAY_LABELS[day]}</Label>
                </div>
                <Switch
                  checked={workingHours[day]?.enabled ?? false}
                  onCheckedChange={(checked) => updateDay(day, "enabled", checked)}
                />
                {workingHours[day]?.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={workingHours[day]?.start || "09:00"}
                      onChange={(e) => updateDay(day, "start", e.target.value)}
                      className="w-32"
                    />
                    <span className="text-gray-500">до</span>
                    <Input
                      type="time"
                      value={workingHours[day]?.end || "18:00"}
                      onChange={(e) => updateDay(day, "end", e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Тариф и использование AI</CardTitle>
            <CardDescription>
              Ваш текущий тариф и месячный лимит AI-сообщений.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium capitalize">Тариф: {plan}</p>
                <p className="text-sm text-gray-500">
                  {aiUsage ? (
                    <>
                      AI-сообщений использовано в этом месяце:{" "}
                      <span className="font-medium">
                        {aiUsage.used} / {aiUsage.limit}
                      </span>
                    </>
                  ) : (
                    "Информация об использовании AI недоступна."
                  )}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {plan}
              </Badge>
            </div>
            {aiUsage && aiUsage.remaining <= 0 && (
              <p className="text-sm text-red-500">
                Вы исчерпали месячный лимит AI-сообщений. Улучшите тариф, чтобы
                продолжить использовать AI-ассистента.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Настройка AI-ассистента</CardTitle>
            <CardDescription>
              Настройте, как ваш AI-ассистент общается с клиентами.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="systemPrompt">Системный промпт</Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Вы — полезный ассистент для..."
                rows={10}
              />
              <p className="text-sm text-gray-500 mt-2">
                Совет: укажите часы работы, правила и любую информацию, которую
                AI должен сообщать клиентам.
              </p>
            </div>
          </CardContent>
        </Card>

        {saveError && (
          <div className="p-3 bg-red-50 rounded-lg text-red-600 text-sm">
            {saveError}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Сохранение..." : saved ? "Сохранено!" : "Сохранить настройки"}
          </Button>
        </div>
      </div>
    </div>
  );
}
