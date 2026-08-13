import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Temporary debug endpoint - records client-side errors into bot_webhook_logs
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { business_id, event, update_text, detail } = body || {};

    const supabase = createAdminClient();
    await supabase.from("bot_webhook_logs").insert({
      user_id: business_id || null,
      chat_id: null,
      event: event || "client_debug",
      update_text: (update_text || "").slice(0, 500),
      detail: detail || {},
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
