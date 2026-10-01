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

// Manage tokens of bookings made on this device, per business. They let the
// customer see and cancel their bookings without an account.
export const MANAGE_TOKENS_KEY = "slot.mobile.bookingTokens";
const MAX_TOKENS_PER_BUSINESS = 50;

export function readManageTokens(businessId: string): string[] {
  const all = readJson<Record<string, string[]>>(MANAGE_TOKENS_KEY) || {};
  return Array.isArray(all[businessId]) ? all[businessId] : [];
}

export function addManageToken(businessId: string, token: string): void {
  const all = readJson<Record<string, string[]>>(MANAGE_TOKENS_KEY) || {};
  const list = (Array.isArray(all[businessId]) ? all[businessId] : []).filter((t) => t !== token);
  list.push(token);
  all[businessId] = list.slice(-MAX_TOKENS_PER_BUSINESS);
  writeJson(MANAGE_TOKENS_KEY, all);
}
