"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMessenger } from "@/lib/messenger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { Service } from "@/types";

export default function ServicesPage() {
  const { webApp, colorScheme } = useMessenger();
  const [services, setServices] = useState<Service[]>([]);

  const businessId = useMemo(() => {
    const startParam = webApp.initDataUnsafe?.start_param;
    if (startParam) {
      return startParam;
    }
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("business_id");
    }
    return null;
  }, [webApp]);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/public/services?business_id=${businessId}`)
      .then((res) => res.json())
      .then(setServices)
      .catch(() => setServices([]));
  }, [businessId]);

  if (!businessId) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-8 text-center"
        style={{
          backgroundColor:
            webApp.themeParams?.bg_color ||
            (colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5"),
          color:
            webApp.themeParams?.text_color ||
            (colorScheme === "dark" ? "#ffffff" : "#000000"),
        }}
      >
        <h1 className="text-lg font-bold mb-2">Бизнес не найден</h1>
        <p className="text-sm opacity-70">
          Откройте это приложение из бота вашего бизнеса в мессенджере.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor:
          webApp.themeParams?.bg_color ||
          (colorScheme === "dark" ? "#1a1a1a" : "#f5f5f5"),
        color:
          webApp.themeParams?.text_color ||
          (colorScheme === "dark" ? "#ffffff" : "#000000"),
      }}
    >
      <header
        className="border-b p-4 sticky top-0"
        style={{
          backgroundColor:
            webApp.themeParams?.header_bg_color ||
            (colorScheme === "dark" ? "#2d2d2d" : "#ffffff"),
          borderColor:
            webApp.themeParams?.section_separator_color || "#e5e5e5",
        }}
      >
        <h1 className="text-lg font-bold text-center">Наши услуги</h1>
      </header>

      <div className="flex-1 p-4">
        {services.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">Услуги пока не добавлены</p>
            <p className="text-sm">Загляните позже.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <Card key={service.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{service.title}</h3>
                      {service.description && (
                        <p className="text-sm opacity-70">
                          {service.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-bold text-blue-600">
                        {service.price} ₽
                      </p>
                      <p className="text-sm opacity-70 flex items-center justify-end">
                        <Clock className="h-3 w-3 mr-1" />
                        {service.duration_minutes} мин
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/book?business_id=${businessId}&service_id=${service.id}${
                      typeof window !== "undefined" ? window.location.hash : ""
                    }`}
                  >
                    <Button
                      className="w-full"
                      onClick={() => webApp.HapticFeedback.impactOccurred("light")}
                    >
                      Записаться
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
