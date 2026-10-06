import * as Sentry from "@sentry/nextjs";

// Error monitoring (Sentry). Does nothing until SENTRY_DSN or
// NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // Errors only: performance tracing would use up the free quota.
    tracesSampleRate: 0,
    // Do not send IP addresses, cookies or request bodies (personal data).
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
