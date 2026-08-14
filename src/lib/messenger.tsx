"use client";

import { useEffect, useState, createContext, useContext, type ReactNode } from "react";

export type MessengerPlatform = "telegram" | "max" | null;

export interface MessengerUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface MessengerWebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: MessengerUser;
    start_param?: string;
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    header_bg_color?: string;
    section_separator_color?: string;
  };
  colorScheme: "light" | "dark";
  HapticFeedback: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
    selectionChanged: () => void;
  };
}

interface MessengerContextType {
  platform: MessengerPlatform;
  webApp: MessengerWebApp;
  user: MessengerUser | undefined;
  initData: string;
  themeParams: MessengerWebApp["themeParams"];
  colorScheme: "light" | "dark";
  isReady: boolean;
}

const MessengerContext = createContext<MessengerContextType | null>(null);

const noopHaptic = {
  impactOccurred: () => {},
  notificationOccurred: () => {},
  selectionChanged: () => {},
};

const DEFAULT_WEB_APP: MessengerWebApp = {
  ready: () => {},
  expand: () => {},
  initData: "",
  initDataUnsafe: {},
  themeParams: {},
  colorScheme: "light",
  HapticFeedback: noopHaptic,
};

const MAX_BRIDGE_SRC = "https://st.max.ru/js/max-web-app.js";

type RawWebApp = Record<string, unknown> & {
  initData?: string;
  initDataUnsafe?: {
    user?: MessengerUser;
    start_param?: string;
  };
  themeParams?: MessengerWebApp["themeParams"];
  colorScheme?: "light" | "dark";
  HapticFeedback?: Partial<MessengerWebApp["HapticFeedback"]>;
  ready?: () => void;
  expand?: () => void;
};

function adaptTelegramWebApp(app: RawWebApp): MessengerWebApp {
  // The Telegram SDK methods (HapticFeedback etc.) rely on `this`, so they must
  // be bound to their original object before being detached and reused.
  const bindMethod = <T,>(fn: T | undefined, ctx: object | undefined): T =>
    (typeof fn === "function" && ctx ? (fn as (...a: unknown[]) => unknown).bind(ctx) : (() => {})) as T;

  const haptics = app.HapticFeedback;
  return {
    ready: bindMethod(app.ready, app),
    expand: bindMethod(app.expand, app),
    initData: app.initData || "",
    initDataUnsafe: app.initDataUnsafe || {},
    themeParams: app.themeParams || {},
    colorScheme: app.colorScheme || "light",
    HapticFeedback: {
      impactOccurred: bindMethod(haptics?.impactOccurred, haptics),
      notificationOccurred: bindMethod(haptics?.notificationOccurred, haptics),
      selectionChanged: bindMethod(haptics?.selectionChanged, haptics),
    },
  };
}

function adaptMaxWebApp(app: RawWebApp): MessengerWebApp {
  const bindMethod = <T,>(fn: T | undefined, ctx: object | undefined): T =>
    (typeof fn === "function" && ctx ? (fn as (...a: unknown[]) => unknown).bind(ctx) : (() => {})) as T;

  const haptics = app.HapticFeedback;
  return {
    // MAX Bridge has no ready()/expand()
    ready: () => {},
    expand: () => {},
    initData: app.initData || "",
    initDataUnsafe: app.initDataUnsafe || {},
    // MAX does not provide theme params / color scheme - use light defaults
    themeParams: {},
    colorScheme: "light",
    HapticFeedback: {
      impactOccurred: bindMethod(haptics?.impactOccurred, haptics),
      notificationOccurred: bindMethod(haptics?.notificationOccurred, haptics),
      selectionChanged: bindMethod(haptics?.selectionChanged, haptics),
    },
  };
}

// Some Telegram clients (e.g. Desktop) inject the initData into the URL hash
// (#tgWebAppData=...) but do not expose the window.Telegram.WebApp object to the
// page. In that case we build the WebApp state directly from the hash.
function webAppFromHash(): {
  platform: MessengerPlatform;
  webApp: MessengerWebApp;
} | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.includes("tgWebAppData=")) return null;

  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const encoded = params.get("tgWebAppData");
    if (!encoded) return null;
    const initData = decodeURIComponent(encoded);

    const initDataUnsafe: MessengerWebApp["initDataUnsafe"] = {};
    const parsed = new URLSearchParams(initData);
    const userRaw = parsed.get("user");
    if (userRaw) initDataUnsafe.user = JSON.parse(userRaw);
    const startParam = parsed.get("start_param");
    if (startParam) initDataUnsafe.start_param = startParam;
    let themeParams: MessengerWebApp["themeParams"] = {};
    const themeRaw = params.get("tgWebAppThemeParams");
    if (themeRaw) {
      try {
        themeParams = JSON.parse(decodeURIComponent(themeRaw));
      } catch {
        // ignore theme parsing errors
      }
    }

    return {
      platform: "telegram",
      webApp: {
        ready: () => {},
        expand: () => {},
        initData,
        initDataUnsafe,
        themeParams,
        colorScheme: "light",
        HapticFeedback: noopHaptic,
      },
    };
  } catch {
    return null;
  }
}

function loadMaxBridge(): Promise<RawWebApp | null> {
  return new Promise((resolve) => {
    const w = window as unknown as { WebApp?: RawWebApp };
    if (w.WebApp) {
      resolve(w.WebApp);
      return;
    }

    const existing = document.querySelector(`script[src="${MAX_BRIDGE_SRC}"]`);
    if (existing) {
      // Wait for the already-injected script to expose WebApp
      let attempts = 0;
      const poll = setInterval(() => {
        attempts += 1;
        if (w.WebApp) {
          clearInterval(poll);
          resolve(w.WebApp);
        } else if (attempts > 50) {
          clearInterval(poll);
          resolve(null);
        }
      }, 100);
      return;
    }

    const script = document.createElement("script");
    script.src = MAX_BRIDGE_SRC;
    script.async = true;
    script.onload = () => resolve(w.WebApp || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// MAX Bridge passes initData in the URL hash (#WebAppData=...). When the bridge
// object is not yet populated, we can build the WebApp state directly from the
// hash, exactly as we do for Telegram (#tgWebAppData=...).
function maxAppFromHash(): {
  platform: MessengerPlatform;
  webApp: MessengerWebApp;
} | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.includes("WebAppData=")) return null;

  try {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const webAppData = params.get("WebAppData");
    if (!webAppData) return null;

    const initData = webAppData;

    const initDataUnsafe: MessengerWebApp["initDataUnsafe"] = {};
    const parsed = new URLSearchParams(decodeURIComponent(initData));
    const userRaw = parsed.get("user");
    if (userRaw) initDataUnsafe.user = JSON.parse(userRaw);
    const startParam = parsed.get("start_param");
    if (startParam) initDataUnsafe.start_param = startParam;

    return {
      platform: "max",
      webApp: {
        ready: () => {},
        expand: () => {},
        initData,
        initDataUnsafe,
        themeParams: {},
        colorScheme: "light",
        HapticFeedback: noopHaptic,
      },
    };
  } catch {
    return null;
  }
}

async function detectWebApp(): Promise<{
  platform: MessengerPlatform;
  webApp: MessengerWebApp;
}> {
  if (typeof window === "undefined") {
    return { platform: null, webApp: DEFAULT_WEB_APP };
  }

  const win = window as unknown as {
    Telegram?: { WebApp?: RawWebApp };
    WebApp?: RawWebApp;
  };

  // Telegram native injection
  if (win.Telegram?.WebApp) {
    return { platform: "telegram", webApp: adaptTelegramWebApp(win.Telegram.WebApp) };
  }

  // Some Telegram clients inject initData into the URL hash only
  const fromHash = webAppFromHash();
  if (fromHash) {
    return fromHash;
  }

  // MAX Bridge (script may already be loaded by the host)
  if (win.WebApp) {
    return { platform: "max", webApp: adaptMaxWebApp(win.WebApp) };
  }

  // MAX Bridge passes initData via the URL hash (#WebAppData=...). If the bridge
  // object is not present, fall back to the hash (covers the MAX web/desktop case).
  const fromMaxHash = maxAppFromHash();
  if (fromMaxHash) {
    return fromMaxHash;
  }

  // Try loading the MAX Bridge script
  const maxApp = await loadMaxBridge();
  if (maxApp) {
    return { platform: "max", webApp: adaptMaxWebApp(maxApp) };
  }

  // MAX data may still be in the hash even if the bridge script failed to load
  const fromMaxHashLate = maxAppFromHash();
  if (fromMaxHashLate) {
    return fromMaxHashLate;
  }

  // Fallback to the Telegram SDK wrapper
  try {
    const mod = await import("@twa-dev/sdk");
    const app = mod.default as unknown as RawWebApp;
    if (app?.initData) {
      return { platform: "telegram", webApp: adaptTelegramWebApp(app) };
    }
  } catch {
    // Not running inside Telegram
  }

  return { platform: null, webApp: DEFAULT_WEB_APP };
}

export function MessengerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    platform: MessengerPlatform;
    webApp: MessengerWebApp;
    isReady: boolean;
  }>({ platform: null, webApp: DEFAULT_WEB_APP, isReady: false });

  useEffect(() => {
    let cancelled = false;
    detectWebApp().then(({ platform, webApp }) => {
      if (cancelled) return;
      if (platform === "telegram") {
        try {
          webApp.ready();
          webApp.expand();
        } catch {
          // ignore
        }
      }
      setState({ platform, webApp, isReady: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state.isReady) {
    return <>{children}</>;
  }

  const { platform, webApp } = state;

  const value: MessengerContextType = {
    platform,
    webApp,
    user: webApp.initDataUnsafe?.user,
    initData: webApp.initData,
    themeParams: webApp.themeParams,
    colorScheme: webApp.colorScheme,
    isReady: true,
  };

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger() {
  const ctx = useContext(MessengerContext);
  if (!ctx) {
    // Safe defaults when used outside the provider (e.g. during SSR)
    return {
      platform: null as MessengerPlatform,
      webApp: DEFAULT_WEB_APP,
      user: undefined,
      initData: "",
      themeParams: {} as MessengerWebApp["themeParams"],
      colorScheme: "light" as const,
      isReady: false,
    };
  }
  return ctx;
}
