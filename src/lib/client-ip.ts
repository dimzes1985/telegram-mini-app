// Returns the caller IP for rate limiting.
// On Vercel `x-vercel-forwarded-for` is set by the platform and cannot be
// spoofed by the client, so it is preferred. Other proxies are only trusted
// as a fallback (local development, self-hosting).
export function getClientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export function phoneDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}
