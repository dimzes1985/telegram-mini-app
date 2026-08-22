import { describe, it, expect } from "vitest";
import { rateLimit, pruneRateLimitBuckets } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows the first request", async () => {
    const result = await rateLimit(`first-${Date.now()}`, {
      windowMs: 60_000,
      max: 5,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks once the max is reached within the window", async () => {
    const key = `burst-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(
        (await rateLimit(key, { windowMs: 60_000, max: 5 })).allowed
      ).toBe(true);
    }
    const blocked = await rateLimit(key, { windowMs: 60_000, max: 5 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates different keys", async () => {
    const a = `a-${Date.now()}`;
    const b = `b-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await rateLimit(a, { windowMs: 60_000, max: 5 });
    }
    expect((await rateLimit(a, { windowMs: 60_000, max: 5 })).allowed).toBe(
      false
    );
    expect((await rateLimit(b, { windowMs: 60_000, max: 5 })).allowed).toBe(
      true
    );
  });

  it("resets after the window expires", async () => {
    const key = `window-${Date.now()}`;
    for (let i = 0; i < 2; i++) {
      await rateLimit(key, { windowMs: 50, max: 2 });
    }
    expect((await rateLimit(key, { windowMs: 50, max: 2 })).allowed).toBe(
      false
    );

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await rateLimit(key, { windowMs: 50, max: 2 })).allowed).toBe(true);
  });
});

describe("pruneRateLimitBuckets", () => {
  it("clears expired buckets", async () => {
    const key = `prune-${Date.now()}`;
    await rateLimit(key, { windowMs: 10, max: 1 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    pruneRateLimitBuckets();
    expect((await rateLimit(key, { windowMs: 10, max: 1 })).allowed).toBe(true);
  });
});
