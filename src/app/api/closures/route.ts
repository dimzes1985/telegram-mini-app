import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody, invalidJsonResponse, validationErrorResponse } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isValidIsoDate } from "@/lib/business-time";
import { isUpcomingDate } from "@/lib/closures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  date: z.string().refine(isValidIsoDate, "Некорректная дата"),
  reason: z
    .string()
    .trim()
    .max(200, "Не более 200 символов")
    .optional()
    .transform((v) => v || null),
});

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET /api/closures - the owner's upcoming days off
export async function GET() {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json([]);

  const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("business_closures")
    .select("id, date, reason")
    .eq("user_id", user.id)
    .gte("date", today)
    .order("date", { ascending: true });

  if (error) {
    console.error("closures GET failed:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить выходные. Выполнена ли миграция migration-step4.sql?" },
      { status: 500 }
    );
  }
  return NextResponse.json(data ?? []);
}

// POST /api/closures - add a day off
export async function POST(req: Request) {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  if (!isUpcomingDate(parsed.data.date)) {
    return NextResponse.json(
      { error: "Выберите дату от сегодня и до года вперёд" },
      { status: 400 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Недоступно в демо-режиме" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("business_closures")
    .insert({ user_id: user.id, date: parsed.data.date, reason: parsed.data.reason })
    .select("id, date, reason")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Этот день уже отмечен выходным" }, { status: 409 });
    }
    console.error("closures POST failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить выходной" }, { status: 500 });
  }

  // Bookings that already exist on this day stay; tell the owner.
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("booking_date", parsed.data.date)
    .neq("status", "cancelled");

  return NextResponse.json({ ...data, existing_bookings: count ?? 0 }, { status: 201 });
}

// DELETE /api/closures?id=... - remove a day off
export async function DELETE(req: Request) {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ success: true });

  const { error } = await supabase
    .from("business_closures")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("closures DELETE failed:", error);
    return NextResponse.json({ error: "Не удалось удалить выходной" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
