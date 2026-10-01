import { timingSafeEqual } from "crypto";

// Validates the Authorization header of a cron request against the configured
// secret using a constant-time comparison.
//
// Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` when
// the CRON_SECRET environment variable is set, so this single check covers both
// Vercel Cron and external schedulers. Arbitrary headers (e.g.
// x-vercel-cron-schedule) must NOT be trusted on their own: external clients can
// set them, which would bypass authentication.
export function isCronRequestAuthorized(
  authHeader: string | null,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authHeader.slice("Bearer ".length));
  const expected = Buffer.from(secret);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
