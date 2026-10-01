import { dayNameOf, daysBetween, isValidIsoDate, nowInTimeZone } from "@/lib/business-time";
import { timeToMinutes } from "@/lib/slot";

// How far ahead customers may book.
export const MAX_BOOKING_DAYS_AHEAD = 90;
// Minimum lead time before a slot starts (minutes).
export const MIN_LEAD_MINUTES = 0;

export interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

export type WorkingHours = Partial<Record<string, WorkingHoursDay>>;

export type SlotRuleError =
  | "invalid_date"
  | "invalid_time"
  | "past"
  | "too_far"
  | "closed"
  | "outside_hours";

export const SLOT_RULE_MESSAGES: Record<SlotRuleError, string> = {
  invalid_date: "Некорректная дата.",
  invalid_time: "Некорректное время.",
  past: "Это время уже прошло. Выберите другое.",
  too_far: `Запись открыта не более чем на ${MAX_BOOKING_DAYS_AHEAD} дней вперёд.`,
  closed: "В этот день мы не работаем.",
  outside_hours: "Выбранное время не входит в часы работы.",
};

// Returns the working-hours window for a date, or null if closed / malformed.
export function workingWindow(
  workingHours: WorkingHours | null | undefined,
  date: string
): { start: number; end: number } | null {
  const day = workingHours?.[dayNameOf(date)];
  if (!day?.enabled) return null;
  const start = timeToMinutes(day.start);
  const end = timeToMinutes(day.end);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

// Checks date/time rules shared by every booking path (mini-app, mobile, AI).
// Overlap with other bookings is checked separately (and enforced by the DB).
export function checkSlotRules(params: {
  date: string;
  time: string;
  durationMinutes: number;
  workingHours: WorkingHours | null | undefined;
  timeZone?: string;
  now?: Date;
}): SlotRuleError | null {
  const { date, time, durationMinutes, workingHours, timeZone, now } = params;
  if (!isValidIsoDate(date)) return "invalid_date";
  const start = timeToMinutes(time);
  if (start === null) return "invalid_time";

  const local = nowInTimeZone(timeZone, now);
  const ahead = daysBetween(local.date, date);
  if (ahead < 0) return "past";
  if (ahead === 0 && start < local.minutes + MIN_LEAD_MINUTES) return "past";
  if (ahead > MAX_BOOKING_DAYS_AHEAD) return "too_far";

  if (workingHours) {
    const window = workingWindow(workingHours, date);
    if (!window) return "closed";
    if (start < window.start || start + durationMinutes > window.end) {
      return "outside_hours";
    }
  }
  return null;
}
