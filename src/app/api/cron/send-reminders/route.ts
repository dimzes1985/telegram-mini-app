import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sendTomorrowReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET/POST /api/cron/send-reminders
// Daily job (see vercel.json): reminds Telegram / MAX customers about
// tomorrow's bookings. Requires `Authorization: Bearer <CRON_SECRET>`, which
// Vercel Cron sends automatically when CRON_SECRET is set.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (!isCronRequestAuthorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ demo: true, found: 0, sent: 0, failed: 0 });
  }

  try {
    const result = await sendTomorrowReminders(createAdminClient());
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Reminder run failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
