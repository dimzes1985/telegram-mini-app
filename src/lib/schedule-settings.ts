import type { SupabaseClient } from "@supabase/supabase-js";

// Grid step options the owner can pick; null means "by service duration".
export const SLOT_STEP_OPTIONS = [15, 30, 60] as const;
export type SlotStep = (typeof SLOT_STEP_OPTIONS)[number];

export const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30] as const;
export const MAX_BUFFER_MINUTES = 120;

export interface ScheduleSettings {
  // Fixed grid step in minutes, or null to step by service duration + pause.
  slotStepMinutes: SlotStep | null;
  // Pause after every booking (cleanup, rest), in minutes.
  bufferMinutes: number;
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  slotStepMinutes: null,
  bufferMinutes: 0,
};

export function normalizeScheduleSettings(row: unknown): ScheduleSettings {
  const r = (row ?? {}) as { slot_step_minutes?: unknown; buffer_minutes?: unknown };
  const step = Number(r.slot_step_minutes);
  const buffer = Number(r.buffer_minutes);
  return {
    slotStepMinutes: (SLOT_STEP_OPTIONS as readonly number[]).includes(step)
      ? (step as SlotStep)
      : null,
    bufferMinutes:
      Number.isInteger(buffer) && buffer > 0 && buffer <= MAX_BUFFER_MINUTES ? buffer : 0,
  };
}

// Loads the business grid settings. Falls back to defaults when the columns
// do not exist yet (migration-step5.sql not applied) or on any error.
export async function loadScheduleSettings(
  supabase: SupabaseClient,
  businessId: string
): Promise<ScheduleSettings> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("slot_step_minutes, buffer_minutes")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !data) return DEFAULT_SCHEDULE_SETTINGS;
    return normalizeScheduleSettings(data);
  } catch {
    return DEFAULT_SCHEDULE_SETTINGS;
  }
}

// Distance between neighbouring slot starts for a service.
export function gridStepMinutes(settings: ScheduleSettings, durationMinutes: number): number {
  return settings.slotStepMinutes ?? Math.max(15, durationMinutes + settings.bufferMinutes);
}
