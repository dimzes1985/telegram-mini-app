import { z } from "zod";
import { timeToMinutes } from "@/lib/slot";

export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Время должно быть в формате ЧЧ:ММ");

const optionalHhmm = z
  .union([hhmm, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const daySchema = z
  .object({
    start: hhmm,
    end: hhmm,
    enabled: z.boolean(),
    break_start: optionalHhmm,
    break_end: optionalHhmm,
  })
  .refine(
    (d) => !d.enabled || (timeToMinutes(d.end) ?? 0) > (timeToMinutes(d.start) ?? 0),
    { message: "Время окончания работы должно быть позже начала" }
  )
  .refine((d) => !d.break_start === !d.break_end, {
    message: "Укажите и начало, и конец перерыва",
  })
  .refine(
    (d) => {
      if (!d.enabled || !d.break_start || !d.break_end) return true;
      const bs = timeToMinutes(d.break_start) ?? 0;
      const be = timeToMinutes(d.break_end) ?? 0;
      const st = timeToMinutes(d.start) ?? 0;
      const en = timeToMinutes(d.end) ?? 0;
      return be > bs && bs >= st && be <= en;
    },
    { message: "Перерыв должен быть внутри рабочего дня, а его конец — позже начала" }
  );

export const workingHoursSchema = z.object(
  Object.fromEntries(DAY_KEYS.map((d) => [d, daySchema])) as Record<
    (typeof DAY_KEYS)[number],
    typeof daySchema
  >
)
  // Older profiles may miss some days; a missing day is treated as closed.
  .partial();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Не более ${max} символов`)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

// Notification target IDs: Telegram chat ids may be negative (groups).
const optionalId = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : String(v).trim()))
  .refine((v) => v === undefined || v === null || /^-?\d{1,20}$/.test(v), {
    message: "ID должен состоять из цифр",
  });

export const settingsUpdateSchema = z.object({
  business_name: z.string().trim().min(1, "Укажите название").max(200).optional(),
  business_description: optionalText(2000),
  business_address: optionalText(500),
  business_phone: optionalText(50),
  business_email: z
    .union([z.literal(""), z.string().trim().email("Некорректный email").max(200)])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  system_prompt: optionalText(8000),
  working_hours: workingHoursSchema.optional(),
  bot_token: z.string().trim().max(200).optional(),
  max_bot_token: z.string().trim().max(500).optional(),
  bot_username: optionalText(100),
  max_bot_username: optionalText(100),
  telegram_notify_chat_id: optionalId,
  max_notify_user_id: optionalId,
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
