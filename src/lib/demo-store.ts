import { randomUUID } from "crypto";
import type { Booking, Service } from "@/types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_COOKIE = "slot_demo";

export interface WorkingHoursDay {
  start: string;
  end: string;
  enabled: boolean;
}

export interface DemoSettings {
  id: string;
  business_name: string;
  business_description: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  system_prompt: string;
  working_hours: Record<string, WorkingHoursDay>;
  plan: string;
  bot_token: string | null;
  bot_username: string | null;
  bot_webhook_set: boolean;
  max_bot_token: string | null;
  max_bot_username: string | null;
  max_bot_webhook_set: boolean;
  telegram_notify_chat_id: string | null;
  max_notify_user_id: string | null;
}

const DEFAULT_HOURS: Record<string, WorkingHoursDay> = {
  monday: { start: "09:00", end: "18:00", enabled: true },
  tuesday: { start: "09:00", end: "18:00", enabled: true },
  wednesday: { start: "09:00", end: "18:00", enabled: true },
  thursday: { start: "09:00", end: "18:00", enabled: true },
  friday: { start: "09:00", end: "18:00", enabled: true },
  saturday: { start: "10:00", end: "14:00", enabled: false },
  sunday: { start: "10:00", end: "14:00", enabled: false },
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const seedServiceA: Service = {
  id: "00000000-0000-4000-8000-000000000101",
  user_id: DEMO_USER_ID,
  title: "Стрижка",
  description: "Женская или мужская стрижка, 45 минут",
  price: 1800,
  duration_minutes: 45,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const seedServiceB: Service = {
  id: "00000000-0000-4000-8000-000000000102",
  user_id: DEMO_USER_ID,
  title: "Маникюр",
  description: "Классический маникюр с покрытием",
  price: 2500,
  duration_minutes: 60,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const seedServiceC: Service = {
  id: "00000000-0000-4000-8000-000000000103",
  user_id: DEMO_USER_ID,
  title: "Консультация",
  description: "Подбор услуги и ухода",
  price: 0,
  duration_minutes: 30,
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

interface DemoState {
  settings: DemoSettings;
  services: Service[];
  bookings: Booking[];
}

declare global {
  var __slotDemoStore: DemoState | undefined;
}

function createState(): DemoState {
  return {
    settings: {
      id: DEMO_USER_ID,
      business_name: "Slot Studio",
      business_description: "Демо-салон для предпросмотра панели Slot",
      business_address: "Москва, Тверская 1",
      business_phone: "+7 900 000-00-00",
      business_email: "demo@slot.app",
      system_prompt: "Ты вежливый администратор салона Slot Studio.",
      working_hours: DEFAULT_HOURS,
      plan: "pro",
      bot_token: null,
      bot_username: null,
      bot_webhook_set: false,
      max_bot_token: null,
      max_bot_username: null,
      max_bot_webhook_set: false,
      telegram_notify_chat_id: null,
      max_notify_user_id: null,
    },
    services: [seedServiceA, seedServiceB, seedServiceC],
    bookings: [
      {
        id: randomUUID(),
        user_id: DEMO_USER_ID,
        service_id: seedServiceA.id,
        booking_date: todayPlus(0),
        booking_time: "11:00",
        customer_name: "Анна",
        customer_phone: "+79001234567",
        customer_notes: null,
        status: "confirmed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        service: seedServiceA,
      },
      {
        id: randomUUID(),
        user_id: DEMO_USER_ID,
        service_id: seedServiceB.id,
        booking_date: todayPlus(1),
        booking_time: "14:00",
        customer_name: "Мария",
        customer_phone: "+79007654321",
        customer_notes: null,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        service: seedServiceB,
      },
    ],
  };
}

export function getDemoState(): DemoState {
  if (!globalThis.__slotDemoStore) {
    globalThis.__slotDemoStore = createState();
  }
  return globalThis.__slotDemoStore;
}

export function demoUser() {
  return { id: DEMO_USER_ID, email: "demo@slot.app" };
}

export function listDemoBusinesses(q?: string) {
  const { settings } = getDemoState();
  if (q && !settings.business_name.toLowerCase().includes(q.toLowerCase())) {
    return [];
  }
  return [
    {
      id: settings.id,
      business_name: settings.business_name,
      business_description: settings.business_description,
      business_address: settings.business_address,
      business_phone: settings.business_phone,
      working_hours: settings.working_hours,
    },
  ];
}
