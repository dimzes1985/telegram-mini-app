import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ telegram: vi.fn(), max: vi.fn() }));
vi.mock("@/lib/telegram-bot", () => ({ sendTelegramMessage: mocks.telegram }));
vi.mock("@/lib/max-bot", () => ({ sendMaxMessage: mocks.max }));
import { sendTomorrowReminders } from "@/lib/reminders";
const row = { id: "test", booking_date: "2026-10-15", booking_time: "10:00", source: "telegram", customer_name: "Test", customer_messenger_id: "1", service: { title: "Test", duration_minutes: 30 }, business: { business_name: "Test", business_address: null, business_phone: null, bot_token: "test-only", max_bot_token: null } };
function client(markError: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error: markError }); const update = vi.fn().mockReturnValue({ eq });
  const chain: Record<string, unknown> = {};
  for (const name of ["eq", "in", "is", "not"]) chain[name] = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue({ data: [row], error: null });
  const fake = { from: vi.fn().mockReturnValue({ select: () => chain, update }) };
  return { supabase: fake as unknown as SupabaseClient, update };
}
beforeEach(() => { vi.resetAllMocks(); });
describe("reminder acknowledgement", () => {
  it("does not mark failed delivery as sent", async () => { mocks.telegram.mockResolvedValue({ ok: false }); const c = client(); const result = await sendTomorrowReminders(c.supabase); expect(result).toMatchObject({ found: 1, sent: 0, failed: 1 }); expect(c.update).not.toHaveBeenCalled(); });
  it("marks acknowledged delivery", async () => { mocks.telegram.mockResolvedValue({ ok: true }); const c = client(); expect(await sendTomorrowReminders(c.supabase)).toMatchObject({ sent: 1, failed: 0 }); expect(c.update).toHaveBeenCalledWith({ reminder_sent_at: expect.any(String) }); });
  it("fails the job if delivery cannot be acknowledged in the DB", async () => { mocks.telegram.mockResolvedValue({ ok: true }); const c = client({ message: "test failure" }); await expect(sendTomorrowReminders(c.supabase)).rejects.toThrow("acknowledgement"); });
});
