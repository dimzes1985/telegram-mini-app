// Rate limiter with two backends:
// - Upstash Redis REST (shared across serverless instances) when
//   UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the Vercel
//   Marketplace names KV_REST_API_URL / KV_REST_API_TOKEN) are configured.
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

// Upstash REST credentials. Accepts both the Upstash names and the names the
// Vercel Marketplace integration sets (KV_REST_API_URL / KV_REST_API_TOKEN).
function upstashCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function isUpstashConfigured(): boolean {
  return upstashCredentials() !== null;
}

// Health check: true when Redis answers PING.
export async function pingUpstash(): Promise<boolean> {
  try {
    const [result] = await upstashPipeline([["PING"]]);
    return result === "PONG";
  } catch {
    return false;
  }
}

async function upstashPipeline(
  commands: Array<Array<string | number>>
): Promise<unknown[]> {
  const credentials = upstashCredentials();
  if (!credentials) {
    throw new Error("Upstash Redis is not configured");
  }
  const { url, token } = credentials;

  // Multiple commands must go to the /pipeline endpoint; the root endpoint
  // accepts a single command only.
  const response = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) {
    throw new Error(`Upstash error ${response.status}`);
  }

  // Pipeline response: [{ result: ... } | { error: "..." }, ...]
  const data = (await response.json()) as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(data)) {
    throw new Error("Unexpected Upstash pipeline response");
  }
  const failed = data.find((item) => item?.error);
  if (failed?.error) {
    throw new Error(failed.error);
  }
  return data.map((item) => item?.result);
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
