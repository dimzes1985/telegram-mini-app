"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { useMessenger } from "@/lib/messenger";
import { ArrowLeft, Check } from "lucide-react";
import { Service, TimeSlot } from "@/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BookingFlowProps {
  businessId: string;
  initialServiceId?: string | null;
}

type Step = "services" | "datetime" | "confirm" | "success";

export function BookingFlow({ businessId, initialServiceId }: BookingFlowProps) {
  const { webApp, initData, platform } = useMessenger();
  const [step, setStep] = useState<Step>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Temporary debug helper - reports client-side errors to the debug log
  const reportDebug = (event: string, text: string, detail: object) => {
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: businessId,
        event,
        update_text: text,
        detail,
      }),
    }).catch(() => {});
  };

  // Report any uncaught JS error on this page
  useEffect(() => {
    const onError = (ev: ErrorEvent) =>
      reportDebug("window_error", ev.message || "", {
        stack: ev.error?.stack || "",
        source: `${ev.filename}:${ev.lineno}`,
      });
    const onRejection = (ev: PromiseRejectionEvent) =>
      reportDebug("unhandled_rejection", String(ev.reason || ""), {});
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch services. If the flow was opened with a preselected service
  // (e.g. from the services catalog), jump straight to the calendar step.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/services?business_id=${businessId}`)
      .then((res) => res.json())
      .then((list: Service[]) => {
        if (cancelled) return;
        setServices(list);
        if (initialServiceId) {
          const service = list.find((s) => s.id === initialServiceId);
          if (service) {
            setSelectedService(service);
            setStep("datetime");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, initialServiceId]);

  // Fetch time slots when date and service are selected
  useEffect(() => {
    if (selectedDate && selectedService) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      fetch(
        `/api/timeslots?date=${dateStr}&service_id=${selectedService.id}&business_id=${businessId}`
      )
        .then((res) => res.json())
        .then(setTimeSlots)
        .catch(() => setTimeSlots([]));
    }
  }, [selectedDate, selectedService, businessId]);

  const handleBooking = async () => {
    try {
      if (!selectedService || !selectedDate || !selectedTime || !customerName) {
        reportDebug("booking_skipped", "", { selectedService: !!selectedService, selectedDate: !!selectedDate, selectedTime, customerName: !!customerName });
        return;
      }

      reportDebug("booking_submit", `time=${selectedTime}`, {
        service: selectedService.id,
        date: format(selectedDate, "yyyy-MM-dd"),
        initDataLen: (initData || "").length,
        platform,
        hasTelegram:
          typeof window !== "undefined" &&
          !!(
            window as unknown as { Telegram?: { WebApp?: unknown } }
          ).Telegram?.WebApp,
        url: typeof window !== "undefined" ? window.location.href : "",
      });
      webApp.HapticFeedback.notificationOccurred("success");
      setLoading(true);
      setError(null);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: selectedService.id,
          user_id: businessId,
          booking_date: format(selectedDate, "yyyy-MM-dd"),
          booking_time: selectedTime,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          initData,
          platform,
        }),
      });

      const data = await res.json().catch(() => ({}));
      reportDebug("booking_response", `status=${res.status}`, { body: data });

      if (res.ok) {
        webApp.HapticFeedback.notificationOccurred("success");
        setStep("success");
      } else {
        webApp.HapticFeedback.notificationOccurred("error");
        setError(data.error || "Что-то пошло не так. Попробуйте ещё раз.");
      }
      setLoading(false);
    } catch (e) {
      setLoading(false);
      reportDebug("booking_error", "", { error: String(e), stack: e instanceof Error ? e.stack : "" });
    }
  };

  // Step 1: Select Service
  if (step === "services") {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Выберите услугу</h2>
        {services.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">Услуги пока не добавлены</p>
            <p className="text-sm">Загляните позже.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
            <Card
              key={service.id}
              className="cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => {
                webApp.HapticFeedback.impactOccurred("medium");
                setSelectedService(service);
                setStep("datetime");
              }}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{service.title}</h3>
                    {service.description && (
                      <p className="text-sm text-gray-600">
                        {service.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{service.price} ₽</p>
                    <p className="text-sm text-gray-500">
                      {service.duration_minutes} мин
                    </p>
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

  // Step 2: Select Date & Time
  if (step === "datetime") {
    return (
      <div className="p-4">
        <button
          onClick={() => setStep("services")}
          className="flex items-center text-gray-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад
        </button>
        <h2 className="text-xl font-bold mb-4">
          Выберите дату и время
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {selectedService?.title} — {selectedService?.price} ₽
        </p>

        <div className="mb-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(value) => setSelectedDate(value)}
            disabled={(date: Date) => date < new Date()}
            className="rounded-md border"
          />
        </div>

        {selectedDate && (
          <div>
            <h3 className="font-medium mb-2">Доступное время</h3>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Нет доступного времени на эту дату.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {timeSlots.map((slot) => (
                  <Button
                    key={slot.time}
                    variant={selectedTime === slot.time ? "default" : "outline"}
                    disabled={!slot.available}
                    onClick={() => {
                      try {
                        reportDebug("time_clicked", `time=${slot.time}`, { step });
                        setSelectedTime(slot.time);
                        setStep("confirm");
                        webApp.HapticFeedback.selectionChanged();
                      } catch (e) {
                        reportDebug("time_click_error", `time=${slot.time}`, { error: String(e) });
                      }
                    }}
                    className="text-sm"
                  >
                    {slot.time}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Step 3: Confirm Booking
  if (step === "confirm") {
    return (
      <div className="p-4">
        <button
          onClick={() => setStep("datetime")}
          className="flex items-center text-gray-600 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад
        </button>
        <h2 className="text-xl font-bold mb-4">Подтвердить запись</h2>

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Услуга</span>
                <span className="font-medium">{selectedService?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Дата</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "d MMM yyyy", { locale: ru })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Время</span>
                <span className="font-medium">{selectedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Цена</span>
                <span className="font-bold text-blue-600">
                  {selectedService?.price} ₽
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Ваше имя *</Label>
            <Input
              id="name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Иван"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Телефон (необязательно)</Label>
            <Input
              id="phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+7 (900) 000-00-00"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleBooking}
            disabled={!customerName || loading}
          >
            {loading ? "Бронируем..." : "Подтвердить запись"}
          </Button>
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Step 4: Success
  if (step === "success") {
    return (
      <div className="p-4 text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">Запись подтверждена!</h2>
        <p className="text-gray-600 mb-4">
          Ваша запись успешно создана.
        </p>
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Услуга</span>
                <span className="font-medium">{selectedService?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Дата</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "d MMM yyyy", { locale: ru })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Время</span>
                <span className="font-medium">{selectedTime}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button
          variant="outline"
          onClick={() => {
            setStep("services");
            setSelectedService(null);
            setSelectedDate(undefined);
            setSelectedTime(null);
            setCustomerName("");
            setCustomerPhone("");
          }}
        >
          Записаться ещё
        </Button>
      </div>
    );
  }

  return null;
}
