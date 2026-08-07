import { NextResponse } from "next/server";

// Deprecated: the webhook now lives at /api/bot/webhook/[businessId].
// This route is kept only to return a helpful error for old webhook URLs.
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Deprecated webhook URL. Re-run bot setup to register the per-business webhook URL." },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Deprecated webhook URL. Re-run bot setup to register the per-business webhook URL." },
    { status: 410 }
  );
}
