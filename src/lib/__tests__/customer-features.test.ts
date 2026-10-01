import { describe, it, expect, vi, afterEach } from "vitest";
import { addDaysIso, buildReminderText } from "@/lib/reminders";
import { minutesUntilStart, canCustomerCancel } from "@/lib/customer-bookings";

afterEach(() => vi.useRealTimers());

describe("reminders", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds a reminder and escapes HTML", () => {
    const text = buildReminderText(
      {
        id: "1",
        booking_date: "2026-08-25",
        booking_time: "14:00:00",
        customer_name: "Анна",
        source: "telegram",
        customer_messenger_id: "1",
        service: { title: "Стрижка <VIP>", duration_minutes: 60 },
        business: {
          business_name: "Салон",
          business_address: "ул. Ленина, 1",
          business_phone: null,
          bot_token: "x",
          max_bot_token: null,
        },
      },
      true
    );
    expect(text).toContain("25.08.2026");
    expect(text).toContain("14:00–15:00");
    expect(text).toContain("Стрижка &lt;VIP&gt;");
    expect(text).toContain("ул. Ленина, 1");
  });
});

describe("customer cancellation window", () => {
  it("counts minutes until start in Moscow time", () => {
    // 06:00 UTC = 09:00 Moscow
    const now = new Date("2026-08-24T06:00:00Z");
    expect(minutesUntilStart("2026-08-24", "12:00", now)).toBe(180);
    expect(minutesUntilStart("2026-08-25", "09:00", now)).toBe(1440);
  });

  it("allows cancelling only up to 2 hours before", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T06:00:00Z")); // 09:00 MSK
    expect(canCustomerCancel({ booking_date: "2026-08-24", booking_time: "11:00", status: "pending" })).toBe(true);
    expect(canCustomerCancel({ booking_date: "2026-08-24", booking_time: "10:30", status: "pending" })).toBe(false);
    expect(canCustomerCancel({ booking_date: "2026-08-25", booking_time: "10:00", status: "cancelled" })).toBe(false);
  });
});
