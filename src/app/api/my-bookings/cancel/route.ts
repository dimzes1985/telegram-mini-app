import { NextResponse } from "next/server";
import { sendPushToOwner } from "@/lib/push";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody, invalidJsonResponse, validationErrorResponse } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { cancelCustomerBooking } from "@/lib/customer-bookings";
import { customerRequestSchema, resolveCustomer } from "@/lib/customer-request";
import { notifyOwner } from "@/lib/notify-owner";
import { formatRuDate } from "@/lib/place-booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cancelSchema = customerRequestSchema.extend({
  booking_id: z.string().uuid("Некорректный id записи"),
});

// POST /api/my-bookings/cancel - the customer cancels their own booking.
export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Недоступно в демо-режиме" }, { status: 400 });
  }

  pruneRateLimitBuckets();
  const limit = await rateLimit(`my-bookings-cancel:${getClientIp(req)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  const supabase = createAdminClient();
  const resolved = await resolveCustomer(supabase, parsed.data);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const result = await cancelCustomerBooking(
    supabase,
    parsed.data.business_id,
    parsed.data.booking_id,
    resolved.scope
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const b = result.booking;
  await sendPushToOwner(parsed.data.business_id, {
    title: "❌ Клиент отменил запись",
    body: `${b.service_title} · ${formatRuDate(b.booking_date)} ${b.booking_time}\n${result.customerName}`,
    url: "/admin/bookings",
  });
  await notifyOwner(
    resolved.business,
    [
      "❌ Клиент отменил запись",
      "",
      `🛠 Услуга: ${b.service_title}`,
      `📅 Дата: ${formatRuDate(b.booking_date)}`,
      `🕒 Время: ${b.booking_time}`,
      `👤 Клиент: ${result.customerName}`,
    ].join("\n")
  );

  return NextResponse.json(b);
}
