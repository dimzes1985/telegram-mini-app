"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatInterface } from "@/components/telegram/chat-interface";
import { BookingFlow } from "@/components/telegram/booking-flow";
import { useMessenger } from "@/lib/messenger";
import { useState } from "react";
import { MessageSquare, Calendar, ListChecks } from "lucide-react";
import { MyBookings } from "@/components/customer/my-bookings";

export default function MiniApp({ businessId }: { businessId: string | null }) {
  const { user, webApp, colorScheme, platform, initData } = useMessenger();
  const [tab, setTab] = useState("chat");

  if (!businessId) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
        style={{
          backgroundColor: webApp.themeParams?.bg_color || (colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5"),
          color: webApp.themeParams?.text_color || (colorScheme === "dark" ? "#ffffff" : "#000000"),
        }}
      >
        <h1 className="text-lg font-bold mb-2">Бизнес не найден</h1>
        <p className="text-sm opacity-70">
          Откройте это приложение из бота вашего бизнеса в мессенджере.
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
          {user?.first_name ? `Привет, ${user.first_name}!` : "Запись"}
        </h1>
      </header>

      {/* Main Content */}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-hidden">
          <TabsContent value="chat" className="h-full m-0">
            <ChatInterface businessId={businessId} />
          </TabsContent>
          <TabsContent value="book" className="h-full m-0 overflow-y-auto">
            <BookingFlow businessId={businessId} />
          </TabsContent>
          <TabsContent value="my" className="h-full m-0 overflow-y-auto p-4">
            {tab === "my" && (
              <MyBookings
                businessId={businessId}
                platform={platform === "max" ? "max" : "telegram"}
                initData={initData}
                variant={colorScheme === "dark" ? "dark" : "light"}
                onBookNew={() => setTab("book")}
              />
            )}
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
          <TabsList className="grid w-full grid-cols-3 h-14">
            <TabsTrigger
              value="chat"
              className="flex flex-col gap-1 h-full rounded-none data-[state=active]:bg-gray-100"
              onClick={() => webApp.HapticFeedback.impactOccurred("light")}
            >
              <MessageSquare className="h-5 w-5" />
              <span className="text-xs">Чат</span>
            </TabsTrigger>
            <TabsTrigger
              value="book"
              className="flex flex-col gap-1 h-full rounded-none data-[state=active]:bg-gray-100"
              onClick={() => webApp.HapticFeedback.impactOccurred("light")}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-xs">Запись</span>
            </TabsTrigger>
            <TabsTrigger
              value="my"
              className="flex flex-col gap-1 h-full rounded-none data-[state=active]:bg-gray-100"
              onClick={() => webApp.HapticFeedback.impactOccurred("light")}
            >
              <ListChecks className="h-5 w-5" />
              <span className="text-xs">Мои записи</span>
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  );
}
