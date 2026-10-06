"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { BookingCalendar } from "@/components/booking-calendar";
import { useTimeSlots } from "@/lib/use-time-slots";
import { useStaffForService } from "@/lib/use-staff";
import { StaffPicker } from "@/components/staff-picker";
import { useMessenger } from "@/lib/messenger";
import { bookingEndTime } from "@/lib/slot";
import { ArrowLeft, Check } from "lucide-react";
import { Service } from "@/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface BookingFlowProps {
  businessId: string;
  initialServiceId?: string | null;
}

type Step = "services" | "datetime" | "confirm" | "success";

interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
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

export function BookingFlow({ businessId, initialServiceId }: BookingFlowProps) {
  const { webApp, initData, platform } = useMessenger();
  const [step, setStep] = useState<Step>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  // null = any free staff member
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  // Staff member assigned by the server (shown on the success screen).
  const [bookedStaffName, setBookedStaffName] = useState<string | null>(null);
  const [workingHours, setWorkingHours] = useState<Record<string, WorkingHoursDay> | null>(null);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch business working hours so non-working days can be disabled
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/business-info?business_id=${businessId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.working_hours) {
          setWorkingHours(data.working_hours);
        }
        if (!cancelled && Array.isArray(data?.closed_dates)) {
          setClosedDates(data.closed_dates);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  // Free slots, refreshed periodically and when the app is reopened so a
  // time booked from another messenger disappears without reloading.
  const { slots: timeSlots, refresh: refreshSlots } = useTimeSlots({
    businessId,
    serviceId: selectedService?.id,
    date: selectedDate,
    staffId: selectedStaffId,
  });

  const staffList = useStaffForService(businessId, selectedService?.id);
  const selectedStaffName =
    staffList?.find((s) => s.id === selectedStaffId)?.name ?? null;

  const isWorkingDay = (date: Date): boolean => {
    if (closedDates.includes(format(date, "yyyy-MM-dd"))) return false;
    const staffHours = staffList?.find((s) => s.id === selectedStaffId)?.working_hours;
    const schedule = staffHours ?? workingHours;
    if (!schedule) return true;
    const dayName = DAY_NAMES[date.getDay()];
    const hours = schedule[dayName];
    return !!hours && hours.enabled;
  };

  const selectedEndTime =
    selectedService && selectedTime
      ? bookingEndTime(selectedTime, selectedService.duration_minutes)
      : null;

  const handleBooking = async () => {
    try {
      if (!selectedService || !selectedDate || !selectedTime || !customerName) {
        return;
      }

      webApp.HapticFeedback.notificationOccurred("success");
      setLoading(true);
      setError(null);
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: selectedService.id,
          user_id: businessId,
          staff_id: selectedStaffId,
          booking_date: format(selectedDate, "yyyy-MM-dd"),
          booking_time: selectedTime,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          initData,
          platform,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        webApp.HapticFeedback.notificationOccurred("success");
        setBookedStaffName(data?.staff?.name ?? null);
        setStep("success");
      } else {
        webApp.HapticFeedback.notificationOccurred("error");
        setError(data.error || "Что-то пошло не так. Попробуйте ещё раз.");
        if (res.status === 409) {
          // Someone else took this time: show fresh slots to pick another.
          refreshSlots();
          setSelectedTime(null);
          setStep("datetime");
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
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
                setSelectedStaffId(null);
                setSelectedTime(null);
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

        {staffList && (
          <StaffPicker
            staff={staffList}
            selected={selectedStaffId}
            onSelect={(id) => {
              setSelectedStaffId(id);
              setSelectedTime(null);
            }}
          />
        )}

        <div className="mb-4">
          <BookingCalendar
            selected={selectedDate}
            onSelect={(value) => setSelectedDate(value)}
            isDayAvailable={isWorkingDay}
          />
        </div>

        {error && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {selectedDate && (
          <div>
            <h3 className="font-medium mb-2">Доступное время</h3>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                {isWorkingDay(selectedDate)
                  ? "Нет свободного времени на эту дату."
                  : "В этот день нет приёма. Выберите рабочий день."}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {timeSlots.map((slot) => (
                  <Button
                    key={slot.time}
                    variant={selectedTime === slot.time ? "default" : "outline"}
                    disabled={!slot.available}
                    onClick={() => {
                      setSelectedTime(slot.time);
                      setError(null);
                      setStep("confirm");
                      webApp.HapticFeedback.selectionChanged();
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
                <span className="font-medium">
                  {selectedTime}
                  {selectedEndTime ? `–${selectedEndTime}` : ""}
                </span>
              </div>
              {staffList && staffList.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Мастер</span>
                  <span className="font-medium">{selectedStaffName ?? "Любой свободный"}</span>
                </div>
              )}
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
                <span className="font-medium">
                  {selectedTime}
                  {selectedEndTime ? `–${selectedEndTime}` : ""}
                </span>
              </div>
              {bookedStaffName && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Мастер</span>
                  <span className="font-medium">{bookedStaffName}</span>
                </div>
              )}
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
            setSelectedStaffId(null);
            setBookedStaffName(null);
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
