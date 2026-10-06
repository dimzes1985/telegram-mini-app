import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDemoState } from "@/lib/demo-store";
import { nowInTimeZone } from "@/lib/business-time";
import {
  computeStats,
  periodRange,
  STATS_PERIODS,
  type StatsBookingRow,
  type StatsPeriod,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

// Upper bound of bookings loaded for one period (protects the function).
const MAX_ROWS = 10_000;

// GET /api/stats?period=30d - owner statistics for a period
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const param = new URL(req.url).searchParams.get("period");
  const period: StatsPeriod = STATS_PERIODS.some((p) => p.id === param)
    ? (param as StatsPeriod)
    : "30d";
  const today = nowInTimeZone().date;
  const range = periodRange(period, today);

  if (!isSupabaseConfigured()) {
    const rows = getDemoState().bookings as unknown as StatsBookingRow[];
    return NextResponse.json(computeStats(rows, range, today));
  }

  const query = (select: string) =>
    supabase
      .from("bookings")
      .select(select)
      .eq("user_id", user.id)
      .gte("booking_date", range.from)
      .lte("booking_date", range.to)
      .limit(MAX_ROWS);

  let { data, error } = await query("*, service:services(title, price), staff:staff(name)");
  // Staff table missing (migration-step6-staff.sql not applied).
  if (error) ({ data, error } = await query("*, service:services(title, price)"));
  if (error) {
    console.error("stats query failed:", error);
    return NextResponse.json({ error: "Не удалось загрузить статистику" }, { status: 500 });
  }

  return NextResponse.json(
    computeStats((data ?? []) as unknown as StatsBookingRow[], range, today)
  );
}
