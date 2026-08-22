import { describe, it, expect } from "vitest";
import { getPlan, PLANS, currentYearMonth } from "@/lib/plans";

describe("plans", () => {
  it("has all three plans with sensible pricing", () => {
    expect(PLANS.free.priceMonthlyRub).toBe(0);
    expect(PLANS.pro.priceMonthlyRub).toBe(1490);
    expect(PLANS.business.priceMonthlyRub).toBe(4990);
  });

  it("falls back to free for unknown plans", () => {
    expect(getPlan(null)).toBe("free");
    expect(getPlan(undefined)).toBe("free");
    expect(getPlan("ultra")).toBe("free");
  });

  it("returns the plan for known values", () => {
    expect(getPlan("free")).toBe("free");
    expect(getPlan("pro")).toBe("pro");
    expect(getPlan("business")).toBe("business");
  });

  it("formats the current year-month", () => {
    const value = currentYearMonth();
    expect(value).toMatch(/^\d{4}-\d{2}$/);
  });
});
