import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getPlan, PLANS } from "@/lib/plans";
import { parseJsonBody, invalidJsonResponse, validationErrorResponse } from "@/lib/http";
import { workingHoursSchema } from "@/lib/settings-schema";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDemoState } from "@/lib/demo-store";
import { normalizeStaff, STAFF_FIELDS, type StaffMember } from "@/lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Не удалось загрузить мастеров. Выполнена ли миграция migration-step6-staff.sql?";

const staffSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(100, "Не более 100 символов"),
  description: z
    .string()
    .trim()
    .max(500, "Не более 500 символов")
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  service_ids: z.array(z.string().uuid()).max(200).optional().default([]),
  working_hours: workingHoursSchema.nullable().optional().default(null),
  active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10_000).optional().default(0),
});

const updateSchema = staffSchema.partial().extend({ id: z.string().uuid() });

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Plan limit on the number of (non-archived) staff members.
async function staffLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data } = await supabase.from("users").select("plan").eq("id", userId).single();
  const plan = getPlan(data?.plan);
  return { max: PLANS[plan].maxStaff, planName: PLANS[plan].name };
}

// GET the owner's staff (with plan limit info)
export async function GET() {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    const max = PLANS.pro.maxStaff;
    return NextResponse.json({ staff: getDemoState().staff, max_staff: max, plan: "Pro" });
  }

  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_FIELDS)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("staff GET failed:", error);
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 });
  }

  const { max, planName } = await staffLimit(supabase, user.id);
  return NextResponse.json({
    staff: ((data ?? []) as unknown as StaffMember[]).map(normalizeStaff),
    max_staff: Number.isFinite(max) ? max : null,
    plan: planName,
  });
}

// POST add a staff member
export async function POST(req: Request) {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  if (!isSupabaseConfigured()) {
    const member: StaffMember = { id: randomUUID(), ...parsed.data };
    getDemoState().staff.push(member);
    return NextResponse.json(member, { status: 201 });
  }

  const { max, planName } = await staffLimit(supabase, user.id);
  const { count } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("archived_at", null);
  if (count !== null && count >= max) {
    return NextResponse.json(
      {
        error: `Тариф ${planName} позволяет до ${max} ${max === 1 ? "мастера" : "мастеров"}. Перейдите на старший тариф, чтобы добавить ещё.`,
      },
      { status: 403 }
    );
  }

  // Only the owner's own services may be attached.
  const serviceIds = await ownServiceIds(supabase, user.id, parsed.data.service_ids);

  const { data, error } = await supabase
    .from("staff")
    .insert({ ...parsed.data, service_ids: serviceIds, user_id: user.id })
    .select(STAFF_FIELDS)
    .single();
  if (error) {
    console.error("staff POST failed:", error);
    return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 });
  }
  return NextResponse.json(normalizeStaff(data as unknown as StaffMember), { status: 201 });
}

// PATCH update a staff member
export async function PATCH(req: Request) {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { id, ...fields } = parsed.data;
  // .partial() keeps the defaults of the create schema; only send what the
  // client actually provided.
  const provided = body as Record<string, unknown>;
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => v !== undefined && k in provided)
  );

  if (!isSupabaseConfigured()) {
    const member = getDemoState().staff.find((s) => s.id === id);
    if (!member) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
    Object.assign(member, update);
    return NextResponse.json(member);
  }

  if (Array.isArray(update.service_ids)) {
    update.service_ids = await ownServiceIds(supabase, user.id, update.service_ids as string[]);
  }

  const { data, error } = await supabase
    .from("staff")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select(STAFF_FIELDS)
    .maybeSingle();
  if (error) {
    console.error("staff PATCH failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить мастера" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Мастер не найден" }, { status: 404 });
  return NextResponse.json(normalizeStaff(data as unknown as StaffMember));
}

// DELETE a staff member: archived when they have bookings (history stays).
export async function DELETE(req: Request) {
  const { supabase, user } = await requireOwner();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Не указан мастер" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const state = getDemoState();
    state.staff = state.staff.filter((s) => s.id !== id);
    return NextResponse.json({ success: true });
  }

  const { count, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("staff_id", id);
  if (countError) {
    console.error("staff bookings count failed:", countError);
    return NextResponse.json({ error: "Не удалось удалить мастера" }, { status: 500 });
  }

  const { error } =
    (count ?? 0) > 0
      ? await supabase
          .from("staff")
          .update({ active: false, archived_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", user.id)
      : await supabase.from("staff").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("staff DELETE failed:", error);
    return NextResponse.json({ error: "Не удалось удалить мастера" }, { status: 500 });
  }
  return NextResponse.json({ success: true, archived: (count ?? 0) > 0 });
}

async function ownServiceIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("services")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  return (data ?? []).map((s) => s.id as string);
}
