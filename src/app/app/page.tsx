"use client";

import { useMemo } from "react";
import { useMessenger } from "@/lib/messenger";
import MiniApp from "@/components/telegram/mini-app";

export default function TelegramMiniApp() {
  const { webApp } = useMessenger();

  // Derive business id during render:
  // start_param from Telegram takes priority, then the URL query param.
  const businessId = useMemo(() => {
    const startParam = webApp.initDataUnsafe?.start_param;
    if (startParam) {
      return startParam;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("business_id");
    }
    return null;
  }, [webApp]);

  return <MiniApp businessId={businessId} />;
}
