export const SAVED_BUSINESS_KEY = "slot.mobile.business";
export const CUSTOMER_KEY = "slot.mobile.customer";

export interface SavedBusiness {
  id: string;
  business_name: string;
  business_description?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
}

export interface SavedCustomer {
  name: string;
  phone: string;
}

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function clearKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
