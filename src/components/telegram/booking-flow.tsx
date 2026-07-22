"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useTelegram } from "@/lib/telegram";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { Service, TimeSlot } from "@/types";
import { format } from "date-fns";

interface BookingFlowProps {
  businessId: string;
}

type Step = "services" | "datetime" | "confirm" | "success";

export function BookingFlow({ businessId }: BookingFlowProps) {
  const { webApp } = useTelegram();
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

  // Fetch services
  useEffect(() => {
    fetch(`/api/public/services?business_id=${businessId}`)
      .then((res) => res.json())
      .then(setServices)
      .catch(() => setServices([]));
  }, [businessId]);

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
    if (!selectedService || !selectedDate || !selectedTime || !customerName) return;

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
      }),
    });

    if (res.ok) {
      webApp.HapticFeedback.notificationOccurred("success");
      setStep("success");
    } else {
      const data = await res.json();
      webApp.HapticFeedback.notificationOccurred("error");
      setError(data.error || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  // Step 1: Select Service
  if (step === "services") {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Select a Service</h2>
        {services.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No services available</p>
            <p className="text-sm">Please check back later.</p>
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
                    <p className="font-bold text-blue-600">${service.price}</p>
                    <p className="text-sm text-gray-500">
                      {service.duration_minutes} min
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
          Back
        </button>
        <h2 className="text-xl font-bold mb-4">
          Pick a Date & Time
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          {selectedService?.title} - ${selectedService?.price}
        </p>

        <div className="mb-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date < new Date()}
            className="rounded-md border"
          />
        </div>

        {selectedDate && (
          <div>
            <h3 className="font-medium mb-2">Available Times</h3>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No available time slots for this date.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {timeSlots.map((slot) => (
                  <Button
                    key={slot.time}
                    variant={selectedTime === slot.time ? "default" : "outline"}
                    disabled={!slot.available}
                    onClick={() => {
                      webApp.HapticFeedback.selectionChanged();
                      setSelectedTime(slot.time);
                      setStep("confirm");
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
          Back
        </button>
        <h2 className="text-xl font-bold mb-4">Confirm Booking</h2>

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Service</span>
                <span className="font-medium">{selectedService?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Time</span>
                <span className="font-medium">{selectedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Price</span>
                <span className="font-bold text-blue-600">
                  ${selectedService?.price}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Your Name *</Label>
            <Input
              id="name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleBooking}
            disabled={!customerName || loading}
          >
            {loading ? "Booking..." : "Confirm Booking"}
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
        <h2 className="text-xl font-bold mb-2">Booking Confirmed!</h2>
        <p className="text-gray-600 mb-4">
          Your appointment has been booked successfully.
        </p>
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Service</span>
                <span className="font-medium">{selectedService?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date</span>
                <span className="font-medium">
                  {selectedDate && format(selectedDate, "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Time</span>
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
          Book Another Appointment
        </Button>
      </div>
    );
  }

  return null;
}
