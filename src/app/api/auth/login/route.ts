import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  parseJsonBody,
  invalidJsonResponse,
  validationErrorResponse,
} from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_COOKIE } from "@/lib/demo-store";

const loginSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().optional(),
  action: z.enum(["login", "signup", "demo"]).default("login"),
  business_name: z.string().trim().max(200).optional(),
});

function demoResponse() {
  const res = NextResponse.json({ ok: true, demo: true });
  res.cookies.set(DEMO_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { email, password, action, business_name } = parsed.data;

  if (!isSupabaseConfigured() || action === "demo") {
    return demoResponse();
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  if (action === "signup") {
    if (!email || !password) {
      return NextResponse.json({ error: "Укажите почту и пароль" }, { status: 400 });
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { business_name: business_name || "My Business" } },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      needs_confirmation: true,
      message: "Аккаунт создан. Проверьте почту или войдите.",
    });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Укажите почту и пароль" }, { status: 400 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true, demo: false });
}
