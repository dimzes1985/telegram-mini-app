"use client";

import { useMemo } from "react";
import { addDays, startOfDay, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { MAX_BOOKING_DAYS_AHEAD } from "@/lib/booking-rules";
import { cn } from "@/lib/utils";

interface BookingCalendarProps {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  // Extra rule on top of the booking horizon (days off, closures).
  isDayAvailable?: (date: Date) => boolean;
  className?: string;
}

// Customer-facing date picker shared by the Telegram / MAX mini-app and the
// mobile web app: Russian locale, weeks start on Monday, navigation limited to
// the months inside the booking horizon, large tap targets for phones.
export function BookingCalendar({
  selected,
  onSelect,
  isDayAvailable,
  className,
}: BookingCalendarProps) {
  const { today, lastDay } = useMemo(() => {
    const t = startOfDay(new Date());
    return { today: t, lastDay: addDays(t, MAX_BOOKING_DAYS_AHEAD) };
  }, []);

  return (
    <Calendar
      mode="single"
      locale={ru}
      weekStartsOn={1}
      selected={selected}
      onSelect={onSelect}
      startMonth={startOfMonth(today)}
      endMonth={startOfMonth(lastDay)}
      disabled={(date: Date) =>
        date < today || date > lastDay || (isDayAvailable ? !isDayAvailable(date) : false)
      }
      className={cn(
        "w-full rounded-md border [--cell-size:--spacing(10)] [&_.rdp-day]:aspect-auto [&_.rdp-day]:h-11 [&_.rdp-caption_label]:text-base [&_.rdp-caption_label]:capitalize",
        className
      )}
      classNames={{ root: "w-full" }}
    />
  );
}
