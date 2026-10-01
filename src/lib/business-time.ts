// Business-local date/time helpers.
//
// Vercel runs in UTC, while customers and owners think in local time
// (Moscow by default). Every "today", "now" and day-of-week decision must be
// made in the business time zone, never with the server clock.

export const DEFAULT_BUSINESS_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || "Europe/Moscow";

export interface ZonedNow {
  date: string; // YYYY-MM-DD in the business time zone
  minutes: number; // minutes since local midnight
}

// Current date and time in the given IANA time zone.
export function nowInTimeZone(
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE,
  now: Date = new Date()
): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type DayName = (typeof DAY_NAMES)[number];

// Validates a YYYY-MM-DD calendar date (rejects 2026-02-31 etc.).
export function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

// Day of week for a calendar date. Computed in UTC from the date string, so
// it does not depend on the server time zone.
export function dayNameOf(date: string): DayName {
  const [y, m, d] = date.split("-").map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Whole days from `from` to `to` (both YYYY-MM-DD).
export function daysBetween(from: string, to: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}
