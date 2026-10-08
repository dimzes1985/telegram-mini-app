// Yandex.Metrika helpers. The counter id comes from NEXT_PUBLIC_YM_ID at build
// time; without it every call is a no-op.
export const YM_ID = Number(process.env.NEXT_PUBLIC_YM_ID || 0) || null;

type Ym = (id: number, method: string, ...args: unknown[]) => void;

// Sends a conversion goal (create goals with the same ids in Metrika:
// signup, booking_created, checkout_start, promo_applied).
export function reachGoal(goal: string, params?: Record<string, unknown>): void {
  if (!YM_ID || typeof window === "undefined") return;
  try {
    const ym = (window as unknown as { ym?: Ym }).ym;
    ym?.(YM_ID, "reachGoal", goal, params);
  } catch {
    // analytics must never break the app
  }
}
