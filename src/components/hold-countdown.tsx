"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

// "Время закреплено за вами ещё 4:59" while the picked time is held.
export function HoldCountdown({
  expiresAt,
  className,
}: {
  expiresAt: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  if (left === 0) {
    return (
      <p
        className={cn(
          "flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800",
          className
        )}
      >
        <Timer className="mt-0.5 size-4 shrink-0" />
        Время больше не закреплено. Подтвердите запись — если оно ещё свободно, вы
        запишетесь.
      </p>
    );
  }
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800",
        className
      )}
    >
      <Timer className="size-4 shrink-0" />
      Время закреплено за вами ещё на {minutes}:{seconds}
    </p>
  );
}
