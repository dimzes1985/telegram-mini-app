"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, List } from "lucide-react";
import { CalendarView } from "./calendar-page";
import { BookingsListView } from "./bookings-list";

export default function BookingsPage() {
  const [view, setView] = useState<"list" | "calendar">("list");

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Bookings</h1>
        <div className="flex gap-2">
          <Button
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            onClick={() => setView("calendar")}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </Button>
        </div>
      </div>
      {view === "list" ? <BookingsListView /> : <CalendarView />}
    </div>
  );
}
