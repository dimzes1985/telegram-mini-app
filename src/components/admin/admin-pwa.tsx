"use client";

import { useEffect } from "react";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __slotInstallPrompt?: InstallPromptEvent | null;
  }
}

// Registers the service worker and keeps the browser "install app" prompt so
// the dashboard card can show its own "Установить" button later.
export function AdminPwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__slotInstallPrompt = e as InstallPromptEvent;
      window.dispatchEvent(new Event("slot-install-available"));
    };
    const onInstalled = () => {
      window.__slotInstallPrompt = null;
      window.dispatchEvent(new Event("slot-install-available"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
