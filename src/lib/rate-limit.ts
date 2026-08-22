// Rate limiter with two backends:
// - Upstash Redis REST (shared across serverless instances) when
//   UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured.
// - In-memory fallback for local development and single-instance deployments.
//
// The in-memory map is per-instance, so on horizontally-scaled deployments
// (e.g. multiple Vercel functions) it only approximates the limit. For exact
// accounting configure Upstash Redis.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function upstashPipeline(
  commands: Array<Array<string | number>>
): Promise<unknown[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Redis is not configured");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    throw new Error(`Upstash error ${response.status}`);
  }

  const data = (await response.json()) as {
    result?: unknown;
    results?: unknown[];
    error?: string;
  };
  if (data.error) {
    throw new Error(data.error);
  }
  return (data.results ?? data.result) as unknown[];
}

// Exact shared rate limiting backed by Redis. Uses INCR + EXPIRE NX so a key
// without a TTL (e.g. after a transient EXPIRE failure) is repaired on the
// next request.
async function rateLimitUpstash(
  key: string,
  { windowMs, max }: RateLimitOptions
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const results = await upstashPipeline([
    ["INCR", key],
    ["EXPIRE", key, windowSeconds, "NX"],
  ]);

  const count = Number(results[0] ?? 0);

  if (count > max) {
    const ttlResults = await upstashPipeline([["TTL", key]]);
    const ttl = Number(ttlResults[0] ?? windowSeconds);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: ttl > 0 ? ttl * 1000 : windowMs,
    };
  }

  return { allowed: true, remaining: max - count, retryAfterMs: 0 };
}

function rateLimitInMemory(
  key: string,
  { windowMs, max }: RateLimitOptions
): RateLimitResult {
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

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (isUpstashConfigured()) {
    try {
      return await rateLimitUpstash(key, options);
    } catch (e) {
      // If the shared store is unavailable, fall back to the local limiter
      // rather than failing the request outright.
      console.error("Upstash rate limit failed, falling back to in-memory:", e);
    }
  }
  return rateLimitInMemory(key, options);
}

// Prevent unbounded memory growth in the in-memory backend by periodically
// cleaning stale buckets. Called lazily - safe to invoke on any request.
export function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
