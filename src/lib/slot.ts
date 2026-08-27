// Time-slot helpers shared by the booking flows (mini-app, AI assistant,
// admin UI). All times are minutes since midnight, and intervals are
// half-open [start, start + duration).

// Parses "HH:MM" or "HH:MM:SS" (Postgres TIME casts to seconds) into minutes
// since midnight. Returns null for anything else.
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Formats minutes since midnight as "HH:MM".
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// Two half-open intervals overlap when each one starts before the other ends.
export function intervalsOverlap(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

// Returns the "HH:MM" end time of a booking that starts at `startTime` and
// lasts `durationMinutes`. Falls back to the input on malformed times.
export function bookingEndTime(startTime: string, durationMinutes: number): string {
  const start = timeToMinutes(startTime);
  if (start === null) return startTime;
  return minutesToTime(start + durationMinutes);
}

// A booked interval as returned by Supabase queries (booking_time may carry
// seconds because Postgres TIME does; duration comes from the service).
export interface BookedSlot {
  startTime: string;
  durationMinutes: number;
}

// Shape of a bookings row fetched with the embedded service duration, e.g.
// `.select("booking_time, service:services!inner(duration_minutes)")`.
export interface BookingRowWithDuration {
  booking_time: string;
  service: { duration_minutes: number } | null;
}

// Normalizes booking rows (with their service duration) into BookedSlot list.
export function toBookedSlots(rows: unknown): BookedSlot[] {
  return ((rows ?? []) as unknown as BookingRowWithDuration[]).map((b) => ({
    startTime: b.booking_time,
    durationMinutes: b.service?.duration_minutes ?? 30,
  }));
}

// Returns the first existing booking that overlaps [startTime, startTime +
// durationMinutes), or null when the slot is free.
export function findOverlappingSlot(
  existing: BookedSlot[],
  startTime: string,
  durationMinutes: number
): BookedSlot | null {
  const start = timeToMinutes(startTime);
  if (start === null) return null;
  for (const slot of existing) {
    const otherStart = timeToMinutes(slot.startTime);
    if (otherStart === null) continue;
    if (intervalsOverlap(start, durationMinutes, otherStart, slot.durationMinutes)) {
      return slot;
    }
  }
  return null;
}
