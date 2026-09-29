import { describe, it, expect } from "vitest";
import { isSubscriptionEntitled, type SubscriptionRow } from "@/lib/subscription";

const now = new Date("2026-09-29T12:00:00.000Z");

function sub(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    plan: "pro",
    status: "active",
    cancel_at_period_end: false,
    yookassa_payment_method_id: "pm_123",
    current_period_end: "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("isSubscriptionEntitled", () => {
  it("is false without a subscription", () => {
    expect(isSubscriptionEntitled(null, now)).toBe(false);
    expect(isSubscriptionEntitled(undefined, now)).toBe(false);
  });

  it("grants access while the paid period is running", () => {
    expect(isSubscriptionEntitled(sub(), now)).toBe(true);
  });

  it("grants access when no end date is set but the status is active", () => {
    expect(isSubscriptionEntitled(sub({ current_period_end: null }), now)).toBe(true);
  });

  it("lapses once the period ended for a cancelled subscription", () => {
    expect(
      isSubscriptionEntitled(
        sub({
          current_period_end: "2026-09-19T00:00:00.000Z",
          cancel_at_period_end: true,
        }),
        now
      )
    ).toBe(false);
  });

  it("lapses once the period ended without a saved payment method", () => {
    expect(
      isSubscriptionEntitled(
        sub({
          current_period_end: "2026-09-19T00:00:00.000Z",
          yookassa_payment_method_id: null,
        }),
        now
      )
    ).toBe(false);
  });

  it("keeps a short grace window for an in-flight auto-renewal", () => {
    expect(
      isSubscriptionEntitled(
        sub({ current_period_end: "2026-09-29T00:00:00.000Z" }),
        now
      )
    ).toBe(true);
  });

  it("lapses an auto-renewal past the grace window", () => {
    expect(
      isSubscriptionEntitled(
        sub({ current_period_end: "2026-09-27T00:00:00.000Z" }),
        now
      )
    ).toBe(false);
  });

  it("does not grant access for past_due or expired states", () => {
    expect(isSubscriptionEntitled(sub({ status: "past_due" }), now)).toBe(false);
    expect(isSubscriptionEntitled(sub({ status: "expired" }), now)).toBe(false);
    expect(isSubscriptionEntitled(sub({ status: "cancelled" }), now)).toBe(false);
  });
});
