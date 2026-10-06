"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import type { TimeSlot } from "@/types";

// How often the open slot list is refreshed while the customer is choosing.
const REFRESH_INTERVAL_MS = 20_000;

// Loads free time slots for a service and date and keeps them fresh: the
// list is re-fetched periodically, whenever the app comes back to the
// foreground (Telegram / MAX keep mini-apps alive in the background) and on
// demand via `refresh()` (e.g. after "this time is already taken").
export function useTimeSlots(params: {
  businessId: string | null | undefined;
  serviceId: string | null | undefined;
  date: Date | undefined;
  // Chosen staff member; null/undefined = any staff member.
  staffId?: string | null;
  // The customer's own hold: their held time is not shown as taken.
  holdToken?: string | null;
}) {
  const { businessId, serviceId, date } = params;
  const holdToken = params.holdToken ?? "";
  const staffId = params.staffId ?? "";
  const dateStr = date ? format(date, "yyyy-MM-dd") : null;
  const key =
    businessId && serviceId && dateStr ? `${businessId}|${serviceId}|${dateStr}|${staffId}` : null;
  // Slots are stored with the selection they belong to, so stale slots of
  // another day are never shown while the new ones load.
  const [loaded, setLoaded] = useState<{ key: string; slots: TimeSlot[] } | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!businessId || !serviceId || !dateStr) return;
    const requestKey = `${businessId}|${serviceId}|${dateStr}|${staffId}`;
    const controller = new AbortController();
    const url =
      `/api/timeslots?date=${dateStr}&service_id=${encodeURIComponent(serviceId)}` +
      `&business_id=${encodeURIComponent(businessId)}` +
      (staffId ? `&staff_id=${encodeURIComponent(staffId)}` : "") +
      (holdToken ? `&hold_token=${encodeURIComponent(holdToken)}` : "") +
      `&_=${Date.now()}`;
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLoaded({ key: requestKey, slots: Array.isArray(data) ? data : [] }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setLoaded({ key: requestKey, slots: [] });
      });
    return () => controller.abort();
  }, [businessId, serviceId, dateStr, staffId, holdToken, version]);

  useEffect(() => {
    if (!businessId || !serviceId || !dateStr) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [businessId, serviceId, dateStr, refresh]);

  const slots = loaded && loaded.key === key ? loaded.slots : [];
  return { slots, refresh };
}
