import { describe, it, expect } from "vitest";
import { settingsUpdateSchema } from "@/lib/settings-schema";

const day = (start: string, end: string, enabled = true) => ({ start, end, enabled });

describe("settingsUpdateSchema", () => {
  it("accepts valid working hours", () => {
    const r = settingsUpdateSchema.safeParse({
      working_hours: { monday: day("09:00", "18:00"), sunday: day("10:00", "09:00", false) },
    });
    expect(r.success).toBe(true);
  });

  it("rejects end before start on an open day", () => {
    const r = settingsUpdateSchema.safeParse({ working_hours: { monday: day("18:00", "09:00") } });
    expect(r.success).toBe(false);
  });

  it("rejects malformed time", () => {
    const r = settingsUpdateSchema.safeParse({ working_hours: { monday: day("9:00", "25:00") } });
    expect(r.success).toBe(false);
  });

  it("normalizes empty strings and notify ids", () => {
    const r = settingsUpdateSchema.parse({
      business_email: "",
      telegram_notify_chat_id: -100123,
      max_notify_user_id: "",
    });
    expect(r.business_email).toBeNull();
    expect(r.telegram_notify_chat_id).toBe("-100123");
    expect(r.max_notify_user_id).toBeNull();
  });

  it("rejects a non-numeric notify id", () => {
    expect(settingsUpdateSchema.safeParse({ max_notify_user_id: "abc" }).success).toBe(false);
  });
});
