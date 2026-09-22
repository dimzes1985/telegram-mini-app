"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MobileApp } from "@/components/mobile/mobile-app";

function MobilePageInner() {
  const params = useSearchParams();
  return <MobileApp initialBusinessId={params.get("business_id")} />;
}

export default function MobilePage() {
  return (
    <Suspense
      fallback={
        <div className="mobile-shell grid place-items-center text-sm text-blue-100">
          Загрузка...
        </div>
      }
    >
      <MobilePageInner />
    </Suspense>
  );
}
