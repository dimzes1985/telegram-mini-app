"use client";

import { useParams } from "next/navigation";
import MiniApp from "@/components/telegram/mini-app";

export default function BusinessAppPage() {
  const params = useParams();
  const businessId = Array.isArray(params.businessId) ? params.businessId[0] : (params.businessId as string | undefined);

  return <MiniApp businessId={businessId || null} />;
}
