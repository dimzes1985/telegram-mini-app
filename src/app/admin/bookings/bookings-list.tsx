"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { bookingStatusLabel } from "@/lib/labels";
import { bookingEndTime } from "@/lib/slot";
import { Booking } from "@/types";

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "pending", label: "Ожидают" },
  { key: "confirmed", label: "Подтверждены" },
  { key: "today", label: "Сегодня" },
  { key: "cancelled", label: "Отменены" },
];

const FILTER_KEYS = new Set(FILTERS.map((f) => f.key));

export function BookingsListView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawFilter = searchParams.get("filter");
  const filter =
    rawFilter && FILTER_KEYS.has(rawFilter) ? rawFilter : "all";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    const res = await fetch("/api/bookings");
    if (res.ok) {
      const data = await res.json();
      setBookings(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch("/api/bookings")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setBookings(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStatusUpdate = async (id: string, status: string) => {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      window.alert(data?.error || "Не удалось изменить статус");
    }
    fetchBookings();
  };

  const setFilterTab = (key: string) => {
    router.replace(`/admin/bookings?filter=${key}`, { scroll: false });
  };

  const today = new Date().toISOString().split("T")[0];
  const filteredBookings =
    filter === "all"
      ? bookings
      : filter === "today"
        ? bookings.filter((b) => b.booking_date === today)
        : bookings.filter((b) => b.status === filter);

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilterTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Бронирования не найдены.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{booking.customer_name}</h3>
                    <p className="text-sm text-gray-600">
                      {booking.service?.title}
                      {booking.staff?.name ? ` · ${booking.staff.name}` : ""}
                    </p>
                    <p className="text-sm text-gray-500">
                      {booking.booking_date} в {booking.booking_time}
                      {booking.service?.duration_minutes
                        ? `–${bookingEndTime(booking.booking_time, booking.service.duration_minutes)}`
                        : ""}
                    </p>
                    {booking.customer_phone && (
                      <p className="text-sm text-gray-500">
                        Телефон: {booking.customer_phone}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
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
                    {booking.status === "cancelled" && booking.cancelled_by === "customer" && (
                      <span className="text-xs text-gray-500">отменил клиент</span>
                    )}
                    {booking.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusUpdate(booking.id, "confirmed")
                          }
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Подтвердить
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleStatusUpdate(booking.id, "cancelled")
                          }
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Отменить
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
