"use client";

import { useEffect, useState, createContext, useContext, type ReactNode } from "react";

interface WebApp {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
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

interface TelegramContextType {
  webApp: WebApp;
  user: TelegramContextType["webApp"]["initDataUnsafe"]["user"];
  initData: string;
  themeParams: WebApp["themeParams"];
  colorScheme: "light" | "dark";
  isReady: boolean;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [webApp, setWebApp] = useState<WebApp | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues with window
    import("@twa-dev/sdk").then((mod) => {
      const app = mod.default;
      app.ready();
      app.expand();
      setWebApp(app as unknown as WebApp);
      setIsReady(true);
    });
  }, []);

  if (!webApp) {
    return <>{children}</>;
  }

  const value: TelegramContextType = {
    webApp,
    user: webApp.initDataUnsafe?.user,
    initData: webApp.initData,
    themeParams: webApp.themeParams,
    colorScheme: webApp.colorScheme,
    isReady,
  };

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  const ctx = useContext(TelegramContext);
  if (!ctx) {
    // Return safe defaults when used outside provider (e.g., during SSR)
    return {
      webApp: {
        ready: () => {},
        expand: () => {},
        initData: "",
        initDataUnsafe: {},
        themeParams: {},
        colorScheme: "light" as const,
        HapticFeedback: {
          impactOccurred: () => {},
          notificationOccurred: () => {},
          selectionChanged: () => {},
        },
      } as WebApp,
      user: undefined,
      initData: "",
      themeParams: {} as WebApp["themeParams"],
      colorScheme: "light" as const,
      isReady: false,
    };
  }
  return ctx;
}

export function useTelegramTheme() {
  const { themeParams, colorScheme } = useTelegram();
  return { themeParams, colorScheme };
}
