"use client";

import { useMemo } from "react";
import { BookingFlow } from "@/components/telegram/booking-flow";
import { useMessenger } from "@/lib/messenger";

export default function BookPage() {
  const { webApp, colorScheme } = useMessenger();

  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return { businessId: null as string | null, serviceId: null as string | null };
    }
    const search = new URLSearchParams(window.location.search);
    return {
      businessId: search.get("business_id"),
      serviceId: search.get("service_id"),
    };
  }, []);

  if (!params.businessId) {
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
        <h1 className="text-lg font-bold mb-2">Business not found</h1>
        <p className="text-sm opacity-70">
          Open this app from your business messenger bot to get started.
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
      <BookingFlow
        businessId={params.businessId}
        initialServiceId={params.serviceId}
      />
    </div>
  );
}
