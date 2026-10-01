"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarX, Clock, Loader2, RefreshCw } from "lucide-react";
import { bookingEndTime } from "@/lib/slot";

export interface MyBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  status: "pending" | "confirmed" | "cancelled";
  service_title: string;
  duration_minutes: number;
  price: number | null;
  can_cancel: boolean;
}

interface MyBookingsProps {
  businessId: string;
  platform: "telegram" | "max" | "mobile";
  initData?: string;
  // Mobile web: manage tokens of bookings made on this device.
  tokens?: string[];
  variant?: "light" | "dark";
  onCancelled?: (booking: MyBooking) => void;
  onBookNew?: () => void;
}

const STATUS_LABELS: Record<MyBooking["status"], string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
};

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d} ${MONTHS[m - 1]}, ${wd}`;
}

export function MyBookings({
  businessId,
  platform,
  initData = "",
  tokens = [],
  variant = "light",
  onCancelled,
  onBookNew,
}: MyBookingsProps) {
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const tokensKey = tokens.join(",");

  const dark = variant === "dark";
  const card = dark ? "bg-white/8 text-white" : "bg-black/[0.04]";
  const muted = dark ? "text-blue-200" : "opacity-60";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          platform,
          initData,
          tokens: tokensKey ? tokensKey.split(",") : [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Не удалось загрузить записи");
        setBookings([]);
      } else {
        setBookings(Array.isArray(data) ? data : []);
      }
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }, [businessId, platform, initData, tokensKey]);

  useEffect(() => {
    // Initial load; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function cancel(booking: MyBooking) {
    if (
      !window.confirm(
        `Отменить запись «${booking.service_title}» ${formatDate(booking.booking_date)} в ${booking.booking_time}?`
      )
    ) {
      return;
    }
    setCancellingId(booking.id);
    setError(null);
    try {
      const res = await fetch("/api/my-bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          booking_id: booking.id,
          platform,
          initData,
          tokens: tokensKey ? tokensKey.split(",") : [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Не удалось отменить запись");
        return;
      }
      setBookings((list) =>
        list.map((b) => (b.id === booking.id ? { ...b, status: "cancelled", can_cancel: false } : b))
      );
      onCancelled?.(booking);
    } catch {
      setError("Ошибка соединения");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 py-12 text-sm ${muted}`}>
        <Loader2 className="size-4 animate-spin" /> Загружаем ваши записи…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      {bookings.length === 0 && !error && (
        <div className={`flex flex-col items-center gap-3 py-10 text-center ${muted}`}>
          <CalendarX className="size-8" />
          <p className="text-sm">У вас нет предстоящих записей</p>
          {onBookNew && (
            <button
              type="button"
              onClick={onBookNew}
              className="rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white"
            >
              Записаться
            </button>
          )}
        </div>
      )}

      {bookings.map((b) => (
        <div key={b.id} className={`rounded-2xl p-4 ${card} ${b.status === "cancelled" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{b.service_title}</p>
              <p className={`mt-1 flex items-center gap-1 text-sm ${muted}`}>
                <Clock className="size-3.5" />
                {formatDate(b.booking_date)}, {b.booking_time}–
                {bookingEndTime(b.booking_time, b.duration_minutes)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                b.status === "confirmed"
                  ? "bg-green-500/15 text-green-600"
                  : b.status === "cancelled"
                    ? "bg-red-500/15 text-red-500"
                    : "bg-yellow-500/15 text-yellow-600"
              }`}
            >
              {STATUS_LABELS[b.status]}
            </span>
          </div>
          {b.status !== "cancelled" && (
            <div className="mt-3">
              {b.can_cancel ? (
                <button
                  type="button"
                  disabled={cancellingId === b.id}
                  onClick={() => cancel(b)}
                  className="text-sm font-medium text-red-500 disabled:opacity-50"
                >
                  {cancellingId === b.id ? "Отменяем…" : "Отменить запись"}
                </button>
              ) : (
                <p className={`text-xs ${muted}`}>
                  Отменить онлайн уже нельзя — свяжитесь с нами напрямую
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {bookings.length > 0 && (
        <button
          type="button"
          onClick={load}
          className={`mx-auto flex items-center gap-1 text-xs ${muted}`}
        >
          <RefreshCw className="size-3" /> Обновить
        </button>
      )}
    </div>
  );
}
