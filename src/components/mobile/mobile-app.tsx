"use client";

import { useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  MapPin,
  Phone,
  Search,
  Share2,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as DayPicker } from "@/components/ui/calendar";
import { bookingEndTime } from "@/lib/slot";
import {
  CUSTOMER_KEY,
  SAVED_BUSINESS_KEY,
  clearKey,
  readJson,
  writeJson,
  type SavedBusiness,
  type SavedCustomer,
} from "@/lib/mobile-storage";
import type { Service, TimeSlot } from "@/types";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

interface PublicBusiness extends SavedBusiness {
  working_hours?: Record<string, WorkingHoursDay> | null;
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type Screen = "home" | "services" | "datetime" | "confirm" | "success";

function haptic(kind: "light" | "medium" | "success" | "error" = "light") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const pattern = { light: 8, medium: 16, success: [10, 40, 18], error: [30, 40, 30] }[kind];
  navigator.vibrate(pattern);
}

export function MobileApp({ initialBusinessId }: { initialBusinessId?: string | null }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicBusiness[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [customerName, setCustomerName] = useState(
    () => readJson<SavedCustomer>(CUSTOMER_KEY)?.name || ""
  );
  const [customerPhone, setCustomerPhone] = useState(
    () => readJson<SavedCustomer>(CUSTOMER_KEY)?.phone || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installHint] = useState(() => {
    if (typeof window === "undefined") return { show: false, ios: false };
    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return { show: !standalone, ios };
  });

  async function searchBusinesses(value: string) {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/public/businesses?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Не удалось найти бизнес");
        setResults([]);
        return;
      }
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setSearchError("Нет соединения");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function openBusiness(id: string) {
    try {
      const [infoRes, servicesRes] = await Promise.all([
        fetch(`/api/public/business-info?business_id=${encodeURIComponent(id)}`),
        fetch(`/api/public/services?business_id=${encodeURIComponent(id)}`),
      ]);
      const info = await infoRes.json();
      const list = await servicesRes.json();
      if (!infoRes.ok || !info?.business_name) {
        setError("Бизнес не найден");
        return;
      }
      const next: PublicBusiness = {
        id: info.id || id,
        business_name: info.business_name,
        business_description: info.business_description,
        business_address: info.business_address,
        business_phone: info.business_phone,
        working_hours: info.working_hours,
      };
      setBusiness(next);
      writeJson(SAVED_BUSINESS_KEY, next);
      setServices(Array.isArray(list) ? list : []);
      setScreen("services");
      haptic("medium");
    } catch {
      setError("Не удалось открыть бизнес");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = initialBusinessId || params.get("business_id");
    const saved = readJson<SavedBusiness>(SAVED_BUSINESS_KEY);
    const targetId = fromQuery || saved?.id;
    if (!targetId) return;
    let cancelled = false;
    void (async () => {
      await openBusiness(targetId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBusinessId]);

  useEffect(() => {
    if (!selectedDate || !selectedService || !business) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    fetch(
      `/api/timeslots?date=${dateStr}&service_id=${selectedService.id}&business_id=${business.id}`
    )
      .then((res) => res.json())
      .then(setTimeSlots)
      .catch(() => setTimeSlots([]));
  }, [selectedDate, selectedService, business]);

  const isWorkingDay = (date: Date) => {
    if (!business?.working_hours) return true;
    const hours = business.working_hours[DAY_NAMES[date.getDay()]];
    return !!hours?.enabled;
  };

  const selectedEndTime = useMemo(() => {
    if (!selectedService || !selectedTime) return null;
    return bookingEndTime(selectedTime, selectedService.duration_minutes);
  }, [selectedService, selectedTime]);

  async function handleBooking() {
    if (!business || !selectedService || !selectedDate || !selectedTime || !customerName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: selectedService.id,
          user_id: business.id,
          booking_date: format(selectedDate, "yyyy-MM-dd"),
          booking_time: selectedTime,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          platform: "mobile",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        haptic("error");
        setError(data.error || "Не удалось записаться");
        return;
      }
      writeJson(CUSTOMER_KEY, { name: customerName, phone: customerPhone });
      haptic("success");
      setScreen("success");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  function resetBooking() {
    setSelectedService(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setTimeSlots([]);
    setError(null);
    setScreen("services");
  }

  async function shareApp() {
    const url = business
      ? `${window.location.origin}/mobile?business_id=${business.id}`
      : `${window.location.origin}/mobile`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Slot", text: "Запись на услугу", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="mobile-shell">
      <div className="mobile-status" />
      {screen === "home" && (
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-8 pt-4">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/80">
                iOS и Android
              </p>
              <h1 className="mt-1 text-2xl font-bold text-white">Slot</h1>
            </div>
            <button
              type="button"
              onClick={() => void shareApp()}
              className="grid size-10 place-items-center rounded-full bg-white/8 text-white"
            >
              <Share2 className="size-4" />
            </button>
          </div>

          <div className="rounded-[28px] bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 p-5 text-white shadow-xl">
            <Smartphone className="mb-3 size-8 opacity-90" />
            <h2 className="text-xl font-semibold leading-snug">Запись без Telegram</h2>
            <p className="mt-2 text-sm text-white/80">
              Найдите салон, выберите услугу и свободный слот. Ставится на домашний экран iPhone и Android.
            </p>
          </div>

          {installHint.show && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-blue-100">
              {installHint.ios
                ? "Safari: кнопка «Поделиться» → «На экран Домой». Slot откроется как приложение."
                : "Chrome: меню → «Добавить на главный экран». Slot откроется как приложение."}
            </div>
          )}

          <label className="mt-6 text-sm font-medium text-blue-100">Найти бизнес</label>
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
            <Search className="size-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                void searchBusinesses(e.target.value);
              }}
              placeholder="Название салона или студии"
              className="h-10 border-0 bg-transparent text-slate-900 shadow-none focus-visible:ring-0"
            />
          </div>
          {searching && <p className="mt-3 text-sm text-blue-200">Ищем...</p>}
          {searchError && <p className="mt-3 text-sm text-rose-300">{searchError}</p>}
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openBusiness(item.id)}
                className="w-full rounded-2xl bg-white p-4 text-left shadow-sm"
              >
                <p className="font-semibold text-slate-900">{item.business_name}</p>
                {item.business_address && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="size-3.5" />
                    {item.business_address}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {screen !== "home" && business && (
        <header className="flex items-center gap-3 px-4 pb-3 pt-2">
          <button
            type="button"
            onClick={() => {
              if (screen === "services") {
                setScreen("home");
                return;
              }
              if (screen === "datetime") setScreen("services");
              if (screen === "confirm") setScreen("datetime");
              if (screen === "success") resetBooking();
            }}
            className="grid size-10 place-items-center rounded-full bg-white/8 text-white"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-white">{business.business_name}</p>
            <p className="truncate text-xs text-blue-200">
              {screen === "services" && "Выберите услугу"}
              {screen === "datetime" && "Дата и время"}
              {screen === "confirm" && "Подтверждение"}
              {screen === "success" && "Готово"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearKey(SAVED_BUSINESS_KEY);
              setBusiness(null);
              setScreen("home");
            }}
            className="text-xs text-blue-200"
          >
            Сменить
          </button>
        </header>
      )}

      {screen === "services" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          {business?.business_address && (
            <p className="mb-4 flex items-center gap-1 text-sm text-blue-100">
              <MapPin className="size-3.5" />
              {business.business_address}
            </p>
          )}
          {services.length === 0 ? (
            <p className="py-16 text-center text-blue-100">Услуги пока не добавлены</p>
          ) : (
            <div className="space-y-3">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    haptic("medium");
                    setSelectedService(service);
                    setScreen("datetime");
                  }}
                  className="w-full rounded-3xl bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{service.title}</p>
                      {service.description && (
                        <p className="mt-1 text-sm text-slate-500">{service.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-blue-600">{service.price} ₽</p>
                      <p className="text-xs text-slate-400">{service.duration_minutes} мин</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {screen === "datetime" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <p className="mb-3 text-sm text-blue-100">
            {selectedService?.title} — {selectedService?.price} ₽
          </p>
          <div className="rounded-3xl bg-white p-3">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={(value) => setSelectedDate(value)}
              disabled={(date: Date) => date < startOfDay(new Date()) || !isWorkingDay(date)}
            />
          </div>
          {selectedDate && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1 text-sm font-medium text-white">
                <Clock className="size-4" />
                Свободное время
              </p>
              {timeSlots.length === 0 ? (
                <p className="py-6 text-center text-sm text-blue-200">Нет свободных слотов</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((slot) => (
                    <Button
                      key={slot.time}
                      variant={selectedTime === slot.time ? "default" : "secondary"}
                      disabled={!slot.available}
                      className="h-10 rounded-xl bg-white text-slate-900 disabled:opacity-40"
                      onClick={() => {
                        setSelectedTime(slot.time);
                        haptic();
                        setScreen("confirm");
                      }}
                    >
                      {slot.time}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {screen === "confirm" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <Card className="mb-4 rounded-3xl border-0">
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Услуга</span>
                <span className="font-medium">{selectedService?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Дата</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "d MMM yyyy", { locale: ru })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Время</span>
                <span className="font-medium">
                  {selectedTime}
                  {selectedEndTime ? `–${selectedEndTime}` : ""}
                </span>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-3">
            <div>
              <Label className="text-blue-100">Ваше имя</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="mt-1 h-11 rounded-xl bg-white text-slate-900"
                placeholder="Анна"
              />
            </div>
            <div>
              <Label className="text-blue-100">Телефон</Label>
              <Input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="mt-1 h-11 rounded-xl bg-white text-slate-900"
                placeholder="+7 900 000-00-00"
              />
            </div>
            <Button
              className="h-12 w-full rounded-2xl text-base"
              disabled={!customerName || customerPhone.replace(/\D/g, "").length < 10 || loading}
              onClick={() => void handleBooking()}
            >
              {loading ? "Бронируем..." : "Подтвердить запись"}
            </Button>
            {error && <p className="text-center text-sm text-rose-300">{error}</p>}
          </div>
        </div>
      )}

      {screen === "success" && (
        <div className="flex min-h-0 flex-1 flex-col items-center px-6 pb-10 pt-8 text-center">
          <div className="mb-4 grid size-16 place-items-center rounded-full bg-emerald-400 text-emerald-950">
            <Check className="size-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Вы записаны</h2>
          <p className="mt-2 text-sm text-blue-100">
            {selectedService?.title}
            {selectedDate ? ` · ${format(selectedDate, "d MMM", { locale: ru })}` : ""}
            {selectedTime ? ` · ${selectedTime}` : ""}
          </p>
          {business?.business_phone && (
            <a
              href={`tel:${business.business_phone}`}
              className="mt-4 inline-flex items-center gap-2 text-sm text-white"
            >
              <Phone className="size-4" />
              {business.business_phone}
            </a>
          )}
          <Button className="mt-8 h-12 w-full rounded-2xl" variant="secondary" onClick={resetBooking}>
            Записаться ещё
          </Button>
          <Button className="mt-3 h-12 w-full rounded-2xl" variant="ghost" onClick={() => void shareApp()}>
            <Calendar className="mr-2 size-4" />
            Поделиться ссылкой
          </Button>
        </div>
      )}
    </div>
  );
}
