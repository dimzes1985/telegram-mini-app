import { describe, expect, it } from "vitest";
import { computeStats, periodRange, type StatsBookingRow } from "@/lib/stats";

const row = (over: Partial<StatsBookingRow>): StatsBookingRow => ({
  booking_date: "2026-10-05",
  booking_time: "10:00:00",
  status: "confirmed",
  source: "telegram",
  service: { title: "Стрижка", price: 1000 },
  ...over,
});

describe("periodRange", () => {
  it("builds rolling and calendar-month ranges", () => {
    expect(periodRange("7d", "2026-10-10")).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("prev_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("computeStats", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };
  const rows = [
    row({}),
    row({ booking_date: "2026-10-06", booking_time: "14:30", source: "max", service: { title: "Маникюр", price: 2500 } }),
    row({ booking_date: "2026-10-20", status: "pending" }),
    row({ status: "cancelled", cancelled_by: "customer" }),
    row({ status: "cancelled", cancelled_by: "owner" }),
    row({ booking_date: "2026-11-02" }),
  ];
  const stats = computeStats(rows, range, "2026-10-10");

  it("counts bookings, cancellations and revenue", () => {
    expect(stats.total).toBe(5);
    expect(stats.active).toBe(3);
    expect(stats.cancelled).toBe(2);
    expect(stats.cancelledByCustomer).toBe(1);
    expect(stats.cancelRate).toBe(40);
    expect(stats.revenue).toBe(3500);
    expect(stats.expectedRevenue).toBe(1000);
    expect(stats.averageCheck).toBe(1750);
  });

  it("ranks services, sources, hours and days", () => {
    expect(stats.services[0]).toEqual({ label: "Стрижка", count: 2, revenue: 2000 });
    expect(stats.sources.map((s) => s.label)).toEqual(["Telegram", "MAX"]);
    expect(stats.hours).toEqual([
      { hour: 10, count: 2 },
      { hour: 14, count: 1 },
    ]);
    expect(stats.byDay).toHaveLength(31);
    expect(stats.byDay.find((d) => d.date === "2026-10-05")?.count).toBe(1);
    expect(stats.weekdays.find((d) => d.day === "monday")?.count).toBe(1);
  });
});
