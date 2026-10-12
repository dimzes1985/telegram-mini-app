"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

// Signs out on this device. Push notifications of this account are turned
// off here too, so a shared phone stops receiving someone else's bookings.
export function LogoutButton({ className, label = "Выйти" }: { className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (!window.confirm("Выйти из аккаунта на этом устройстве?")) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
      const sub = await reg?.pushManager?.getSubscription().catch(() => null);
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null);
        await sub.unsubscribe().catch(() => null);
      }
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    } finally {
      // Full reload so no private data stays in memory.
      window.location.href = "/login";
    }
  };

  return (
    <button type="button" onClick={logout} disabled={busy} className={cn("flex items-center gap-2", className)}>
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
      {label}
    </button>
  );
}
