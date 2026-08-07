// Lightweight in-memory rate limiter.
// Suitable for a single instance deployment. For horizontal scaling,
// replace with a shared store (e.g. Upstash Redis).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function rateLimit(
  key: string,
  { windowMs, max }: RateLimitOptions
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: existing.resetAt - now,
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, retryAfterMs: 0 };
}

// Prevent unbounded memory growth by periodically cleaning stale buckets.
// Called lazily - safe to invoke on any request.
export function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
