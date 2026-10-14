import { NextResponse } from "next/server";
import { isUpstashConfigured, pingUpstash } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Read-only dependency check. Never disclose credentials or database errors.
export async function GET() {
  const configured = isUpstashConfigured();
  const redisCheck = configured
    ? pingUpstash().then((ok) => (ok ? "ok" : "error")).catch(() => "error")
    : Promise.resolve("not_configured");
  const databaseCheck = (async () => {
    if (!isSupabaseConfigured()) return "not_configured";
    try {
      const { error } = await createAdminClient()
        .from("users")
        .select("id", { head: true })
        .limit(1)
        .abortSignal(AbortSignal.timeout(3000));
      return error ? "error" : "ok";
    } catch {
      return "error";
    }
  })();
  const [redis, database] = await Promise.all([redisCheck, databaseCheck]);
  const ok = database === "ok" && redis !== "error";
  const sentry =
    process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN ? "on" : "off";
  return NextResponse.json(
    { ok, database, redis, sentry, version: process.env.APP_VERSION || "unknown" },
    { status: ok ? 200 : 503 }
  );
}
