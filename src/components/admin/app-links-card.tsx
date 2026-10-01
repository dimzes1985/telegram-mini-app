"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, ExternalLink, Link2, QrCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

interface LinkItem {
  label: string;
  hint: string;
  url: string;
}

// Renders a QR code for the link (PNG data URL) with a download button.
function QrBlock({ item }: { item: LinkItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(item.url, { width: 480, margin: 2, errorCorrectionLevel: "M" })
      )
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.url]);

  if (failed) return <p className="text-xs text-red-500">Не удалось создать QR-код.</p>;
  if (!src) return <p className="text-xs text-gray-500">Создаём QR-код…</p>;

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
      <img
        src={src}
        alt={`QR-код: ${item.label}`}
        className="size-40 rounded-lg border bg-white"
      />
      <div className="space-y-2 text-xs text-gray-500">
        <p>Наведите камеру телефона — откроется ссылка. QR-код можно распечатать и повесить на стойку администратора или дверь.</p>
        <a
          href={src}
          download={`qr-${item.label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-")}.png`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-4" />
          Скачать PNG
        </a>
      </div>
    </div>
  );
}

function CopyRow({ item }: { item: LinkItem }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Скопируйте ссылку:", item.url);
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{item.label}</p>
      <p className="text-xs text-gray-500">{item.hint}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1.5 text-xs">
          {item.url}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span className="hidden sm:inline">{copied ? "Скопировано" : "Копировать"}</span>
        </Button>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" />
        </a>
        <Button
          type="button"
          variant={showQr ? "default" : "outline"}
          size="sm"
          onClick={() => setShowQr((v) => !v)}
          aria-label="Показать QR-код"
        >
          <QrCode className="size-4" />
          <span className="hidden sm:inline">QR</span>
        </Button>
      </div>
      {showQr && <QrBlock item={item} />}
    </div>
  );
}

// Dashboard card with ready-to-share links to the customer mini-app and bots.
export function AppLinksCard() {
  const [links, setLinks] = useState<LinkItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.id) return;
        const origin = window.location.origin;
        const items: LinkItem[] = [
          {
            label: "Мини-приложение",
            hint: "Открывается в любом браузере. Этот же адрес указывается в настройках мини-приложения MAX.",
            url: `${origin}/b/${data.id}`,
          },
          {
            label: "Веб-версия для клиентов",
            hint: "Удобно для сайта, Instagram, WhatsApp и визиток.",
            url: `${origin}/mobile?business_id=${data.id}`,
          },
        ];
        if (data.bot_username) {
          items.push({
            label: "Telegram-бот",
            hint: "Клиент нажимает «Запустить» и открывает запись через кнопку.",
            url: `https://t.me/${String(data.bot_username).replace(/^@/, "")}`,
          });
        }
        if (data.max_bot_username) {
          items.push({
            label: "MAX-бот",
            hint: "Ссылка на вашего бота в MAX.",
            url: `https://max.ru/${String(data.max_bot_username).replace(/^@/, "")}`,
          });
        }
        setLinks(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!links) return null;

  return (
    <Card className="mb-6 sm:mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Ссылки для клиентов
        </CardTitle>
        <CardDescription>
          Отправьте клиентам или разместите у себя — по ним можно сразу записаться.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.map((item) => (
          <CopyRow key={item.label} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}
