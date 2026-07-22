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
  created_at: string;
  updated_at: string;
  // Joined data
  service?: Service;
}

export interface TimeSlot {
  time: string;
  available: boolean;
}
