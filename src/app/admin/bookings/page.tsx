"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, List } from "lucide-react";
import { CalendarView } from "./calendar-page";
import { BookingsListView } from "./bookings-list";

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500">Загрузка...</div>}>
      <BookingsPageContent />
    </Suspense>
  );
}

function BookingsPageContent() {
  const [view, setView] = useState<"list" | "calendar">("list");

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between sm:mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Бронирования</h1>
        <div className="flex gap-2">
          <Button
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
            className="flex-1 sm:flex-none"
          >
            <List className="h-4 w-4 mr-2" />
            Список
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            onClick={() => setView("calendar")}
            className="flex-1 sm:flex-none"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Календарь
          </Button>
        </div>
      </div>
      {view === "list" ? <BookingsListView /> : <CalendarView />}
    </div>
  );
}
