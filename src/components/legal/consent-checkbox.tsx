"use client";

import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

type LinkOpener = { openLink?: (url: string) => void };

// Inside Telegram / MAX a normal link would replace the mini-app, so legal
// documents are opened in the messenger's browser instead.
export function openLegalLink(event: MouseEvent<HTMLAnchorElement>) {
  const w = window as unknown as {
    Telegram?: { WebApp?: LinkOpener & { initData?: string } };
    WebApp?: LinkOpener & { initData?: string };
  };
  const app = w.Telegram?.WebApp?.initData ? w.Telegram.WebApp : w.WebApp?.initData ? w.WebApp : null;
  if (app?.openLink) {
    event.preventDefault();
    app.openLink(new URL(event.currentTarget.href, window.location.href).toString());
  }
}

// Consent to personal data processing (152-FZ): required before booking.
export function ConsentCheckbox({
  checked,
  onChange,
  tone = "light",
  className,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: "light" | "dark";
  className?: string;
}) {
  const linkClass = tone === "dark" ? "text-white underline" : "text-blue-600 underline";
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 text-xs leading-snug",
        tone === "dark" ? "text-blue-100" : "text-gray-600",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-blue-600"
      />
      <span>
        Я даю{" "}
        <a href="/consent" target="_blank" rel="noopener" className={linkClass} onClick={openLegalLink}>
          согласие на обработку персональных данных
        </a>{" "}
        и принимаю{" "}
        <a href="/privacy" target="_blank" rel="noopener" className={linkClass} onClick={openLegalLink}>
          политику конфиденциальности
        </a>
      </span>
    </label>
  );
}
