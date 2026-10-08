import { describe, it, expect } from "vitest";
import { normalizePromoCode, promoErrorMessage, firstPeriodStart } from "./promo";

describe("normalizePromoCode", () => {
  it("removes spaces and uppercases", () => {
    expect(normalizePromoCode(" start 30 ")).toBe("START30");
    expect(normalizePromoCode("Osnovatel")).toBe("OSNOVATEL");
  });
});

describe("promoErrorMessage", () => {
  it("maps database errors to friendly text", () => {
    expect(promoErrorMessage("already_used")).toMatch(/уже использовали/);
    expect(promoErrorMessage("ERROR: invalid_code")).toMatch(/не найден/);
    expect(promoErrorMessage(undefined)).toMatch(/Не удалось/);
  });
});

describe("firstPeriodStart", () => {
  const now = new Date("2026-03-01T10:00:00Z");
  it("starts after a running trial", () => {
    const end = "2026-03-20T10:00:00Z";
    expect(firstPeriodStart({ status: "trialing", current_period_end: end }, now).toISOString()).toBe(
      new Date(end).toISOString()
    );
  });
  it("starts now without a trial or after it ended", () => {
    expect(firstPeriodStart(null, now)).toEqual(now);
    expect(firstPeriodStart({ status: "active", current_period_end: "2026-03-20T10:00:00Z" }, now)).toEqual(now);
    expect(firstPeriodStart({ status: "trialing", current_period_end: "2026-02-20T10:00:00Z" }, now)).toEqual(now);
  });
});
