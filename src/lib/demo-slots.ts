import {
  findOverlappingSlot,
  minutesToTime,
  toBookedSlots,
} from "@/lib/slot";
import { getDemoState, type WorkingHoursDay } from "@/lib/demo-store";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function demoTimeSlots(date: string, serviceId: string) {
  const state = getDemoState();
  const service = state.services.find((s) => s.id === serviceId && s.active);
  if (!service) return null;

  const dateObj = new Date(date + "T00:00:00");
  const dayName = DAY_NAMES[dateObj.getDay()];
  const todayHours = state.settings.working_hours[dayName] as WorkingHoursDay | undefined;
  if (!todayHours?.enabled) return [];

  const [startHour, startMin] = todayHours.start.split(":").map(Number);
  const [endHour, endMin] = todayHours.end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const durationMinutes = service.duration_minutes ?? 30;

  const bookedSlots = toBookedSlots(
    state.bookings
      .filter((b) => b.booking_date === date && b.status !== "cancelled")
      .map((b) => ({
        booking_time: b.booking_time,
        service: { duration_minutes: b.service?.duration_minutes ?? durationMinutes },
      }))
  );

  const slots = [];
  const isToday = dateObj.toDateString() === new Date().toDateString();
  const step = Math.max(15, durationMinutes);
  for (
    let minutes = startMinutes;
    minutes + durationMinutes <= endMinutes;
    minutes += step
  ) {
    const time = minutesToTime(minutes);
    if (isToday) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < nowMinutes) continue;
    }
    slots.push({
      time,
      available: !findOverlappingSlot(bookedSlots, time, durationMinutes),
    });
  }
  return slots;
}
