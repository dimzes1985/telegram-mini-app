import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan, PLANS } from "@/lib/plans";
import { z } from "zod";
import {
  parseJsonBody,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_USER_ID, getDemoState } from "@/lib/demo-store";
import { randomUUID } from "crypto";

const createServiceSchema = z.object({
  title: z.string().trim().min(1, "Название обязательно").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.number().finite().min(0, "Цена не может быть отрицательной").max(1_000_000),
  duration_minutes: z.number().int().min(5).max(1440).default(30),
  active: z.boolean().optional(),
});

const updateServiceSchema = createServiceSchema
  .partial()
  .extend({ id: z.string().uuid("Некорректный id услуги") });

// GET all services for the logged-in user
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(getDemoState().services);
  }

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create a new service
export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { title, description, price, duration_minutes } = parsed.data;

  if (!isSupabaseConfigured()) {
    const state = getDemoState();
    const service = {
      id: randomUUID(),
      user_id: DEMO_USER_ID,
      title,
      description: description ?? null,
      price,
      duration_minutes: duration_minutes || 30,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    state.services.unshift(service);
    return NextResponse.json(service, { status: 201 });
  }

  // Enforce plan service limit
  const { data: userData } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = getPlan(userData?.plan);
  const maxServices = PLANS[plan].maxServices;

  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("archived_at", null);

  if (count !== null && count >= maxServices) {
    return NextResponse.json(
      {
        error: `Тариф ${PLANS[plan].name} позволяет до ${maxServices} услуг. Перейдите на старший тариф, чтобы добавить ещё.`,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      user_id: user.id,
      title,
      description,
      price,
      duration_minutes: duration_minutes || 30,
      active: parsed.data.active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE a service
export async function DELETE(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Не указан id услуги" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const state = getDemoState();
    state.services = state.services.filter((s) => s.id !== id);
    return NextResponse.json({ success: true });
  }

  // Services that already have bookings are archived instead of deleted, so
  // the booking history (and its FK) stays intact. Unused services are
  // removed for real.
  const { count: bookingsCount, error: countError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("service_id", id)
    .eq("user_id", user.id);

  if (countError) {
    console.error("Service bookings count failed:", countError);
    return NextResponse.json({ error: "Не удалось удалить услугу" }, { status: 500 });
  }

  if ((bookingsCount ?? 0) > 0) {
    const { error } = await supabase
      .from("services")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error("Service archive failed:", error);
      return NextResponse.json({ error: "Не удалось удалить услугу" }, { status: 500 });
    }
    return NextResponse.json({ success: true, archived: true });
  }

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Service delete failed:", error);
    return NextResponse.json({ error: "Не удалось удалить услугу" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// PATCH update a service in place (keeps its id and bookings)
export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = updateServiceSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { id, ...fields } = parsed.data;
  const update = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );

  if (!isSupabaseConfigured()) {
    const service = getDemoState().services.find((s) => s.id === id);
    if (!service) {
      return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
    }
    Object.assign(service, update, { updated_at: new Date().toISOString() });
    return NextResponse.json(service);
  }

  const { data, error } = await supabase
    .from("services")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Service update failed:", error);
    return NextResponse.json({ error: "Не удалось сохранить услугу" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Услуга не найдена" }, { status: 404 });
  }

  return NextResponse.json(data);
}
