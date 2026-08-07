"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatInterface } from "@/components/telegram/chat-interface";
import { BookingFlow } from "@/components/telegram/booking-flow";
import { useTelegram } from "@/lib/telegram";
import { MessageSquare, Calendar } from "lucide-react";

export default function TelegramMiniApp() {
  const { user, webApp, colorScheme } = useTelegram();

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

  if (!businessId) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
        style={{
          backgroundColor: webApp.themeParams?.bg_color || (colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5"),
          color: webApp.themeParams?.text_color || (colorScheme === "dark" ? "#ffffff" : "#000000"),
        }}
      >
        <h1 className="text-lg font-bold mb-2">Business not found</h1>
        <p className="text-sm opacity-70">
          Open this app from your business Telegram bot to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: webApp.themeParams?.bg_color || (colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5"),
        color: webApp.themeParams?.text_color || (colorScheme === "dark" ? "#ffffff" : "#000000"),
      }}
    >
      {/* Header */}
      <header
        className="border-b p-4"
        style={{
          backgroundColor: webApp.themeParams?.header_bg_color || (colorScheme === "dark" ? "#2d2d2d" : "#ffffff"),
          borderColor: webApp.themeParams?.section_separator_color || "#e5e5e5",
        }}
      >
        <h1 className="text-lg font-bold text-center">
          {user ? `Hi, ${user.first_name}!` : "Book Appointment"}
        </h1>
      </header>

      {/* Main Content */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <div className="flex-1 overflow-hidden">
          <TabsContent value="chat" className="h-full m-0">
            <ChatInterface businessId={businessId} />
          </TabsContent>
          <TabsContent value="book" className="h-full m-0 overflow-y-auto">
            <BookingFlow businessId={businessId} />
          </TabsContent>
        </div>

        {/* Bottom Tab Bar */}
        <div
          className="border-t"
          style={{
            backgroundColor: webApp.themeParams?.bg_color || (colorScheme === "dark" ? "#1a1a1a" : "#ffffff"),
            borderColor: webApp.themeParams?.section_separator_color || "#e5e5e5",
          }}
        >
          <TabsList className="grid w-full grid-cols-2 h-14">
            <TabsTrigger
              value="chat"
              className="flex flex-col gap-1 h-full rounded-none data-[state=active]:bg-gray-100"
              onClick={() => webApp.HapticFeedback.impactOccurred("light")}
            >
              <MessageSquare className="h-5 w-5" />
              <span className="text-xs">Chat</span>
            </TabsTrigger>
            <TabsTrigger
              value="book"
              className="flex flex-col gap-1 h-full rounded-none data-[state=active]:bg-gray-100"
              onClick={() => webApp.HapticFeedback.impactOccurred("light")}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-xs">Book</span>
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  );
}
