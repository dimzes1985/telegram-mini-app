import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ configured: vi.fn(), ping: vi.fn(), supabase: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ isUpstashConfigured: mocks.configured, pingUpstash: mocks.ping }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: mocks.supabase }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ limit: () => ({ abortSignal: mocks.query }) }) }) }) }));
import { GET } from "@/app/api/health/route";
beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true); mocks.supabase.mockReturnValue(true); mocks.ping.mockResolvedValue(true); mocks.query.mockResolvedValue({ error: null }); });
describe("health dependency status", () => {
  it("checks the database and shared Redis", async () => { const res = await GET(); expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ ok: true, database: "ok", redis: "ok" }); });
  it("returns 503 when Redis fails", async () => { mocks.ping.mockResolvedValue(false); const res = await GET(); expect(res.status).toBe(503); expect(await res.json()).toMatchObject({ ok: false, redis: "error" }); });
  it("returns 503 for a rejected Redis probe", async () => { mocks.ping.mockRejectedValue(new Error("private details")); expect((await GET()).status).toBe(503); });
  it("returns 503 without exposing database errors", async () => { mocks.query.mockResolvedValue({ error: { message: "private details" } }); const res = await GET(); expect(res.status).toBe(503); expect(await res.text()).not.toContain("private details"); });
  it("does not mark a missing database as ready", async () => { mocks.supabase.mockReturnValue(false); const res = await GET(); expect(res.status).toBe(503); expect(mocks.query).not.toHaveBeenCalled(); });
  it("supports an intentionally unconfigured Redis", async () => { mocks.configured.mockReturnValue(false); const res = await GET(); expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ redis: "not_configured" }); });
});
