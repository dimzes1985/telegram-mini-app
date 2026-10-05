export interface User {
  id: string;
  business_name: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  user_id: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  customer_name: string;
  customer_phone: string | null;
  customer_notes: string | null;
  status: "pending" | "confirmed" | "cancelled";
  source?: "telegram" | "max" | "mobile" | "ai" | "admin" | null;
  cancelled_by?: "customer" | "owner" | null;
  created_at: string;
  updated_at: string;
  staff_id?: string | null;
  // Joined data
  service?: Service;
  staff?: { name: string } | null;
}

export interface Staff {
  id: string;
  name: string;
  description: string | null;
  service_ids: string[];
  working_hours: Record<
    string,
    { start: string; end: string; enabled: boolean; break_start?: string | null; break_end?: string | null }
  > | null;
  active: boolean;
  sort_order: number;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}
