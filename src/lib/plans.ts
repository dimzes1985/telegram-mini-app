export type Plan = "free" | "pro" | "business";

export interface PlanConfig {
  id: Plan;
  name: string;
  priceMonthlyRub: number;
  aiMessagesPerMonth: number;
  maxServices: number;
  maxStaff: number;
  customBranding: boolean;
}

export const PLANS: Record<Plan, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyRub: 0,
    aiMessagesPerMonth: 50,
    maxServices: 3,
    maxStaff: 1,
    customBranding: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyRub: 1490,
    aiMessagesPerMonth: 1000,
    maxServices: 50,
    maxStaff: 3,
    customBranding: true,
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthlyRub: 4990,
    aiMessagesPerMonth: 10000,
    maxServices: Infinity,
    maxStaff: Infinity,
    customBranding: true,
  },
};

export function getPlan(plan?: string | null): Plan {
  if (plan && plan in PLANS) {
    return plan as Plan;
  }
  return "free";
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
