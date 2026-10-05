"use client";

import { useEffect, useState } from "react";

export interface PublicStaff {
  id: string;
  name: string;
  description: string | null;
  // Personal schedule (null = business hours); used to grey out days off.
  working_hours: Record<string, { enabled: boolean } | undefined> | null;
}

// Staff members who perform a service (public list). `null` while loading,
// an empty array when the business has no staff (choice step is skipped).
export function useStaffForService(
  businessId: string | null | undefined,
  serviceId: string | null | undefined
): PublicStaff[] | null {
  const key = businessId && serviceId ? `${businessId}|${serviceId}` : null;
  const [loaded, setLoaded] = useState<{ key: string; staff: PublicStaff[] } | null>(null);

  useEffect(() => {
    if (!businessId || !serviceId) return;
    const requestKey = `${businessId}|${serviceId}`;
    const controller = new AbortController();
    fetch(
      `/api/public/staff?business_id=${encodeURIComponent(businessId)}&service_id=${encodeURIComponent(serviceId)}`,
      { signal: controller.signal, cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLoaded({ key: requestKey, staff: Array.isArray(data) ? data : [] }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setLoaded({ key: requestKey, staff: [] });
      });
    return () => controller.abort();
  }, [businessId, serviceId]);

  if (!key) return [];
  return loaded && loaded.key === key ? loaded.staff : null;
}
