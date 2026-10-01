import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody, invalidJsonResponse, validationErrorResponse } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { listCustomerBookings } from "@/lib/customer-bookings";
import { customerRequestSchema, resolveCustomer } from "@/lib/customer-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/my-bookings - the customer's own upcoming bookings.
// POST (not GET) so initData / tokens are not written to access logs.
export async function POST(req: Request) {
  const body = await parseJsonBody(req);
  if (body === undefined) return invalidJsonResponse();
  const parsed = customerRequestSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  pruneRateLimitBuckets();
  const limit = await rateLimit(`my-bookings:${getClientIp(req)}`, { windowMs: 60_000, max: 30 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  const supabase = createAdminClient();
  const resolved = await resolveCustomer(supabase, parsed.data);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data, error } = await listCustomerBookings(
    supabase,
    parsed.data.business_id,
    resolved.scope
  );
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json(data);
}
