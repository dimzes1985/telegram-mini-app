import { addDaysIso, dayNameOf, daysBetween } from "@/lib/business-time";

export type StatsPeriod = "7d" | "30d" | "month" | "prev_month" | "90d";

export const STATS_PERIODS: Array<{ id: StatsPeriod; label: string }> = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "month", label: "Этот месяц" },
  { id: "prev_month", label: "Прошлый месяц" },
  { id: "90d", label: "90 дней" },
];

// Inclusive date range [from, to] for a period, relative to `today`
// (YYYY-MM-DD in the business time zone).
export function periodRange(period: StatsPeriod, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const monthStart = (year: number, month: number) =>
    `${year}-${String(month).padStart(2, "0")}-01`;
  switch (period) {
    case "7d":
      return { from: addDaysIso(today, -6), to: today };
    case "30d":
      return { from: addDaysIso(today, -29), to: today };
    case "90d":
      return { from: addDaysIso(today, -89), to: today };
    case "month": {
      const from = monthStart(y, m);
      const next = m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1);
      return { from, to: addDaysIso(next, -1) };
    }
    case "prev_month": {
      const from = m === 1 ? monthStart(y - 1, 12) : monthStart(y, m - 1);
      return { from, to: addDaysIso(monthStart(y, m), -1) };
    }
  }
}

export interface StatsBookingRow {
  booking_date: string;
  booking_time: string;
  status: "pending" | "confirmed" | "cancelled";
  source?: string | null;
  cancelled_by?: string | null;
  staff_id?: string | null;
  service?: { title?: string | null; price?: number | null } | null;
  staff?: { name?: string | null } | null;
}

export interface CountItem {
  label: string;
  count: number;
  revenue: number;
}

export interface BusinessStats {
  from: string;
  to: string;
  total: number;
  active: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  cancelledByCustomer: number;
  cancelledByOwner: number;
  // Share of cancelled bookings, 0..100.
  cancelRate: number;
  // Confirmed bookings that already took place (date <= today).
  revenue: number;
  // Active bookings still ahead (date > today) - expected income.
  expectedRevenue: number;
  averageCheck: number;
  byDay: Array<{ date: string; count: number }>;
  services: CountItem[];
  staff: CountItem[];
  sources: CountItem[];
  hours: Array<{ hour: number; count: number }>;
  weekdays: Array<{ day: string; label: string; count: number }>;
}

const SOURCE_LABELS: Record<string, string> = {
  telegram: "Telegram",
  max: "MAX",
  mobile: "Веб-версия",
  ai: "AI-ассистент",
  admin: "Админка",
};

const WEEKDAYS: Array<[string, string]> = [
  ["monday", "Пн"],
  ["tuesday", "Вт"],
  ["wednesday", "Ср"],
  ["thursday", "Чт"],
  ["friday", "Пт"],
  ["saturday", "Сб"],
  ["sunday", "Вс"],
];

function addTo(map: Map<string, CountItem>, label: string, revenue: number) {
  const item = map.get(label) ?? { label, count: 0, revenue: 0 };
  item.count += 1;
  item.revenue += revenue;
  map.set(label, item);
}

const sorted = (map: Map<string, CountItem>) =>
  [...map.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue);

// Aggregates bookings of one period. Cancelled bookings only count towards
// the cancellation numbers; popularity, hours and sources use active ones.
export function computeStats(
  rows: StatsBookingRow[],
  range: { from: string; to: string },
  today: string
): BusinessStats {
  const inRange = rows.filter((r) => r.booking_date >= range.from && r.booking_date <= range.to);
  const active = inRange.filter((r) => r.status !== "cancelled");
  const cancelled = inRange.filter((r) => r.status === "cancelled");

  const price = (r: StatsBookingRow) => Number(r.service?.price ?? 0) || 0;
  const done = active.filter((r) => r.status === "confirmed" && r.booking_date <= today);
  const revenue = done.reduce((sum, r) => sum + price(r), 0);
  const expectedRevenue = active
    .filter((r) => r.booking_date > today)
    .reduce((sum, r) => sum + price(r), 0);

  const days = Math.max(0, daysBetween(range.from, range.to)) + 1;
  const perDay = new Map<string, number>();
  for (const r of active) perDay.set(r.booking_date, (perDay.get(r.booking_date) ?? 0) + 1);
  const byDay = Array.from({ length: days }, (_, i) => {
    const date = addDaysIso(range.from, i);
    return { date, count: perDay.get(date) ?? 0 };
  });

  const services = new Map<string, CountItem>();
  const staff = new Map<string, CountItem>();
  const sources = new Map<string, CountItem>();
  const hours = new Map<number, number>();
  const weekdays = new Map<string, number>();
  for (const r of active) {
    addTo(services, r.service?.title || "Без названия", price(r));
    if (r.staff?.name) addTo(staff, r.staff.name, price(r));
    else if (r.staff_id) addTo(staff, "Удалённый мастер", price(r));
    addTo(sources, SOURCE_LABELS[r.source ?? ""] ?? "Другое", price(r));
    const hour = Number(r.booking_time.slice(0, 2));
    if (Number.isFinite(hour)) hours.set(hour, (hours.get(hour) ?? 0) + 1);
    const day = dayNameOf(r.booking_date);
    weekdays.set(day, (weekdays.get(day) ?? 0) + 1);
  }

  return {
    from: range.from,
    to: range.to,
    total: inRange.length,
    active: active.length,
    confirmed: active.filter((r) => r.status === "confirmed").length,
    pending: active.filter((r) => r.status === "pending").length,
    cancelled: cancelled.length,
    cancelledByCustomer: cancelled.filter((r) => r.cancelled_by === "customer").length,
    cancelledByOwner: cancelled.filter((r) => r.cancelled_by !== "customer").length,
    cancelRate: inRange.length ? Math.round((cancelled.length / inRange.length) * 100) : 0,
    revenue,
    expectedRevenue,
    averageCheck: done.length ? Math.round(revenue / done.length) : 0,
    byDay,
    services: sorted(services),
    staff: sorted(staff),
    sources: sorted(sources),
    hours: [...hours.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ hour, count })),
    weekdays: WEEKDAYS.map(([day, label]) => ({ day, label, count: weekdays.get(day) ?? 0 })),
  };
}
