import { NextResponse } from "next/server";
import { isUpstashConfigured, pingUpstash } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Quick self-check after setting up services: is the shared rate limiter on?
export async function GET() {
  const configured = isUpstashConfigured();
  const redis = configured ? ((await pingUpstash()) ? "ok" : "error") : "not_configured";
  const sentry =
    process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN ? "on" : "off";
  return NextResponse.json({ ok: true, redis, sentry });
}
