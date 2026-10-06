"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SlotHold {
  token: string;
  // Client clock time (ms) when the hold ends.
  expiresAt: number;
}

export type ReserveResult = { ok: true } | { ok: false; error: string };

// Temporary hold of the picked time (POST /api/holds): while the customer
// fills in the form nobody else can take it. Failures other than "taken"
// never block booking - the booking itself re-checks the time anyway.
export function useSlotHold(businessId: string | null | undefined) {
  const [hold, setHold] = useState<SlotHold | null>(null);
  const tokenRef = useRef<string | null>(null);

  const reserve = useCallback(
    async (params: {
      serviceId: string;
      staffId: string | null;
      date: string;
      time: string;
    }): Promise<ReserveResult> => {
      if (!businessId) return { ok: true };
      try {
        const res = await fetch("/api/holds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            business_id: businessId,
            service_id: params.serviceId,
            staff_id: params.staffId,
            date: params.date,
            time: params.time,
            token: tokenRef.current,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.token === "string") {
          tokenRef.current = data.token;
          const seconds = Number(data.expires_in) || 300;
          setHold({ token: data.token, expiresAt: Date.now() + seconds * 1000 });
          return { ok: true };
        }
        if (res.status === 409 || res.status === 400) {
          return { ok: false, error: data.error || "Это время уже занято. Выберите другое." };
        }
      } catch {
        // Network problem: continue without a hold.
      }
      setHold(null);
      return { ok: true };
    },
    [businessId]
  );

  // Frees the held time (customer went back). Resolves when the server
  // has released it, so the refreshed slot list shows it as free again.
  const release = useCallback(async () => {
    const token = tokenRef.current;
    tokenRef.current = null;
    setHold(null);
    if (!token) return;
    await fetch(`/api/holds?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  }, []);

  // After a successful booking the server already removed the hold.
  const forget = useCallback(() => {
    tokenRef.current = null;
    setHold(null);
  }, []);

  // Leaving the screen releases the hold.
  useEffect(() => {
    return () => {
      const token = tokenRef.current;
      if (token) {
        void fetch(`/api/holds?token=${encodeURIComponent(token)}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  return { hold, reserve, release, forget };
}
