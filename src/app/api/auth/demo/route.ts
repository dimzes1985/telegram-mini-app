import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseJsonBody } from "@/lib/http";

export async function POST(req: Request) {
  const body = (await parseJsonBody(req)) as { action?: string } | undefined;
  const action = body?.action || "login";
  const res = NextResponse.json({
    ok: true,
    demo: true,
    supabase: isSupabaseConfigured(),
  });

  if (action === "logout") {
    res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  res.cookies.set(DEMO_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export async function GET() {
  return NextResponse.json({
    supabase: isSupabaseConfigured(),
    demo_available: !isSupabaseConfigured(),
  });
}
