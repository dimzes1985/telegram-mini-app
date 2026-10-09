"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Download, Loader2, Share, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PushState = "loading" | "unsupported" | "unavailable" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detectDevice() {
  if (typeof window === "undefined") return { standalone: false, ios: false, mobile: false };
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return {
    ios,
    mobile: ios || /Android|Mobi/i.test(ua),
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
  };
}

// "Приложение на телефон": install the admin as an app + push notifications.
export function AdminAppCard() {
  // Nothing is rendered until the push state loads, so reading the browser
  // here cannot cause a hydration mismatch.
  const [{ standalone, ios, mobile }] = useState(detectDevice);
  const [canInstall, setCanInstall] = useState(false);
  const [push, setPush] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshPush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPush("unsupported");
      return;
    }
    const cfg = await fetch("/api/push").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!cfg?.enabled) {
      setPush("unavailable");
      return;
    }
    if (Notification.permission === "denied") {
      setPush("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setPush(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    const update = () => setCanInstall(Boolean(window.__slotInstallPrompt));
    window.addEventListener("slot-install-available", update);
    const timer = setTimeout(() => {
      update();
      void refreshPush();
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("slot-install-available", update);
    };
  }, [refreshPush]);

  const install = async () => {
    const prompt = window.__slotInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") window.__slotInstallPrompt = null;
    setCanInstall(Boolean(window.__slotInstallPrompt));
  };

  const enablePush = async () => {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "off");
        return;
      }
      const cfg = await fetch("/api/push").then((r) => r.json());
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.public_key),
        }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error();
      setPush("on");
      setNote({ ok: true, text: "Готово! Теперь новые записи будут приходить уведомлением." });
    } catch {
      setNote({ ok: false, text: "Не удалось включить уведомления. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPush("off");
    } finally {
      setBusy(false);
    }
  };

  const testPush = async () => {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setNote(
      res?.ok
        ? { ok: true, text: "Тестовое уведомление отправлено." }
        : { ok: false, text: data?.error || "Не удалось отправить." }
    );
    setBusy(false);
  };

  // On iPhone notifications work only inside the installed app.
  const iosNeedsInstall = ios && !standalone;
  const showInstall = !standalone && (mobile || canInstall);
  const pushReady = push === "on";

  if (push === "loading" || (push === "unavailable" && !showInstall)) return null;
  if (standalone && pushReady && !note) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm">
        <Bell className="h-4 w-4 text-green-600" />
        <span className="flex-1 text-gray-700">Уведомления о новых записях включены</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={testPush}>
          Проверить
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={disablePush}>
          Выключить
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/50">
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
          <div>
            <p className="font-semibold">Slot Админ на телефоне</p>
            <p className="text-sm text-gray-600">
              Откройте панель одним касанием с главного экрана и получайте уведомления о новых
              записях и отменах.
            </p>
          </div>
        </div>

        {showInstall &&
          (canInstall ? (
            <Button onClick={install} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Установить приложение
            </Button>
          ) : ios ? (
            <ol className="list-decimal space-y-1 rounded-lg bg-white p-3 pl-8 text-sm text-gray-700">
              <li>
                Откройте эту страницу в <b>Safari</b>.
              </li>
              <li>
                Нажмите <Share className="inline h-4 w-4 align-text-bottom" /> «Поделиться» внизу
                экрана.
              </li>
              <li>
                Выберите <b>«На экран „Домой“»</b> → «Добавить».
              </li>
              <li>Откройте Slot Админ с главного экрана и включите уведомления.</li>
            </ol>
          ) : (
            <p className="rounded-lg bg-white p-3 text-sm text-gray-700">
              Откройте меню браузера <b>⋮</b> и выберите <b>«Установить приложение»</b> или{" "}
              <b>«Добавить на главный экран»</b>.
            </p>
          ))}

        {!iosNeedsInstall && push !== "unavailable" && push !== "unsupported" && (
          <div className="flex flex-wrap items-center gap-2">
            {push === "on" ? (
              <>
                <span className="flex items-center gap-1 text-sm text-green-700">
                  <Bell className="h-4 w-4" /> Уведомления включены
                </span>
                <Button size="sm" variant="outline" disabled={busy} onClick={testPush}>
                  Проверить
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={disablePush}>
                  Выключить
                </Button>
              </>
            ) : push === "denied" ? (
              <p className="flex items-center gap-2 text-sm text-amber-700">
                <BellOff className="h-4 w-4 shrink-0" />
                Уведомления запрещены. Разрешите их в настройках браузера или телефона для
                slot-zapis.ru.
              </p>
            ) : (
              <Button variant="outline" disabled={busy} onClick={enablePush}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                Включить уведомления о записях
              </Button>
            )}
          </div>
        )}

        {note && (
          <p className={`text-sm ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
