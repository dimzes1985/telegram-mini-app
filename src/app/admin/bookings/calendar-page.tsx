"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { bookingStatusLabel } from "@/lib/labels";
import { Booking } from "@/types";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";

const WEEKDAY_HEADERS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export function CalendarView() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bookings")
      .then((res) => res.json())
      .then((data) => {
        setBookings(data);
        setLoading(false);
      });
  }, []);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getBookingsForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return bookings.filter((b) => b.booking_date === dateStr);
  };

  const selectedBookings = selectedDate ? getBookingsForDate(selectedDate) : [];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Календарь</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle>{format(currentDate, "MMMM yyyy", { locale: ru })}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAY_HEADERS.map((day) => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dayBookings = getBookingsForDate(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`relative p-2 min-h-[80px] text-left rounded-lg border transition-colors ${
                      !isCurrentMonth
                        ? "bg-gray-50 text-gray-400"
                        : isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "hover:bg-gray-50"
                    } ${isToday ? "ring-2 ring-blue-500" : ""}`}
                  >
                    <span className={`text-sm ${isToday ? "font-bold" : ""}`}>
                      {format(day, "d")}
                    </span>
                    {dayBookings.length > 0 && (
                      <div className="mt-1">
                        {dayBookings.slice(0, 2).map((booking) => (
                          <div
                            key={booking.id}
                            className={`text-xs truncate px-1 py-0.5 rounded ${
                              booking.status === "confirmed"
                                ? "bg-green-100 text-green-700"
                                : booking.status === "cancelled"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {booking.customer_name}
                          </div>
                        ))}
                        {dayBookings.length > 2 && (
                          <div className="text-xs text-gray-500">
                            ещё {dayBookings.length - 2}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Bookings */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDate
                ? format(selectedDate, "d MMM yyyy", { locale: ru })
                : "Выберите дату"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Загрузка...</div>
            ) : !selectedDate ? (
              <div className="text-center py-8 text-gray-500">
                Нажмите на дату, чтобы увидеть бронирования
              </div>
            ) : selectedBookings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Нет бронирований на эту дату
              </div>
            ) : (
              <div className="space-y-3">
                {selectedBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{booking.customer_name}</span>
                      <Badge
                        variant={
                          booking.status === "confirmed"
                            ? "default"
                            : booking.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {bookingStatusLabel(booking.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {booking.service?.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {booking.booking_time}
                    </p>
                    {booking.customer_phone && (
                      <p className="text-sm text-gray-500">
                        Телефон: {booking.customer_phone}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
