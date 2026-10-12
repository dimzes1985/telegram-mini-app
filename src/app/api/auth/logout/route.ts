import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEMO_COOKIE } from "@/lib/demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/logout: ends the session on this device.
export async function POST() {
  const cookieStore = await cookies();
  if (isSupabaseConfigured()) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      }
    );
    // "local": only this device; other phones/computers stay signed in.
    await supabase.auth.signOut({ scope: "local" }).catch(() => null);
  }
  // Remove leftover auth cookies (sb-*-auth-token and its chunks).
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) cookieStore.delete(c.name);
  }
  cookieStore.delete(DEMO_COOKIE);
  return NextResponse.json({ ok: true });
}
