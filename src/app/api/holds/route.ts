import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { findFreeResources } from "@/lib/place-booking";
import { deleteHold, HOLD_MINUTES, MAX_HOLDS_PER_CLIENT } from "@/lib/holds";
import type { WorkingHours } from "@/lib/booking-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

const holdSchema = z.object({
  business_id: uuid,
  service_id: uuid,
  staff_id: uuid.nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  // Previous hold of this customer: it is replaced by the new one.
  token: z.string().min(10).max(100).nullable().optional(),
});

const HOLD_SECONDS = HOLD_MINUTES * 60;

function holdResponse(token: string, staffId: string | null) {
  return NextResponse.json({ token, expires_in: HOLD_SECONDS, staff_id: staffId });
}

// POST: reserve the picked time for HOLD_MINUTES while the customer fills
// in the form. 409 when the time is already taken or held by someone else.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = holdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const { business_id, service_id, staff_id, date, time } = parsed.data;
  const token = parsed.data.token || crypto.randomUUID();

  // Demo mode: no database, pretend the time is held.
  if (!isSupabaseConfigured()) return holdResponse(token, staff_id ?? null);

  const ip = getClientIp(req);
  pruneRateLimitBuckets();
  const limit = await rateLimit(`holds:ip:${ip}`, { windowMs: 10 * 60_000, max: 30 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  // Expired holds are useless: clean them up (also frees the unique index).
  const cleanup = await supabase.from("booking_holds").delete().lt("expires_at", nowIso);
  if (cleanup.error) {
    // Table not created yet (migration not applied): booking works without holds.
    return NextResponse.json({ token: null });
  }

  const { count } = await supabase
    .from("booking_holds")
    .select("id", { count: "exact", head: true })
    .eq("client_key", ip)
    .neq("token", token)
    .gt("expires_at", nowIso);
  if ((count ?? 0) >= MAX_HOLDS_PER_CLIENT) {
    return NextResponse.json(
      { error: "Слишком много выбранных записей. Завершите одну из них." },
      { status: 429 }
    );
  }

  const { data: service } = await supabase
    .from("services")
    .select("id, user_id, duration_minutes")
    .eq("id", service_id)
    .eq("user_id", business_id)
    .eq("active", true)
    .maybeSingle();
  if (!service) {
    return NextResponse.json({ error: "Услуга не найдена или недоступна" }, { status: 404 });
  }

  const { data: business } = await supabase
    .from("users")
    .select("working_hours")
    .eq("id", business_id)
    .maybeSingle();
  if (!business) {
    return NextResponse.json({ error: "Бизнес не найден" }, { status: 404 });
  }

  const durationMinutes = service.duration_minutes ?? 30;
  const availability = await findFreeResources({
    supabase,
    businessId: business_id,
    businessHours: (business.working_hours ?? null) as WorkingHours | null,
    serviceId: service_id,
    durationMinutes,
    date,
    time,
    staffId: staff_id ?? null,
    holdToken: token,
  });
  if (!availability.ok) {
    return NextResponse.json(
      { error: availability.message },
      { status: availability.code === "taken" ? 409 : 400 }
    );
  }

  // One hold per customer: the new one replaces the previous one.
  await deleteHold(supabase, token);

  const expiresAt = new Date(Date.now() + HOLD_SECONDS * 1000).toISOString();
  for (const member of availability.free) {
    const { error } = await supabase.from("booking_holds").insert({
      user_id: business_id,
      service_id,
      staff_id: member?.id ?? null,
      booking_date: date,
      booking_time: time,
      duration_minutes: durationMinutes,
      token,
      client_key: ip,
      expires_at: expiresAt,
    });
    if (!error) return holdResponse(token, member?.id ?? null);
    // 23505: another customer held the same start a moment ago.
    if (error.code !== "23505") {
      console.error("Hold insert failed:", error);
      return NextResponse.json({ token: null });
    }
  }
  return NextResponse.json(
    { error: "Это время уже занято. Выберите другое." },
    { status: 409 }
  );
}

// DELETE ?token=...: the customer went back or changed the time.
export async function DELETE(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (token && token.length <= 100 && isSupabaseConfigured()) {
    await deleteHold(createAdminClient(), token);
  }
  return NextResponse.json({ ok: true });
}
