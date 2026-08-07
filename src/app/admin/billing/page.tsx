"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";

interface PlanInfo {
  id: string;
  name: string;
  price_monthly_rub: number;
  ai_messages_per_month: number;
  max_services: number | null;
  custom_branding: boolean;
}

interface BillingStatus {
  current_plan: string;
  subscription: {
    plan: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  } | null;
  usage: { plan: string; used: number; limit: number; remaining: number } | null;
  available_plans: PlanInfo[];
}

const FREE_PLAN: PlanInfo = {
  id: "free",
  name: "Free",
  price_monthly_rub: 0,
  ai_messages_per_month: 50,
  max_services: 3,
  custom_branding: false,
};

export default function BillingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("status") === "checkout") {
      // Refresh status after returning from payment provider
      router.replace("/admin/billing");
    }
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .finally(() => setLoading(false));
  }, [router, searchParams]);

  const handleCheckout = async (plan: string) => {
    setCheckingOut(plan);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start checkout");
        return;
      }
      if (data.confirmation_url) {
        window.location.assign(data.confirmation_url);
      }
    } catch {
      setError("Connection error");
    } finally {
      setCheckingOut(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  const plans = status ? [...status.available_plans, FREE_PLAN].sort((a, b) => a.price_monthly_rub - b.price_monthly_rub) : [FREE_PLAN];
  const currentPlan = status?.current_plan || "free";

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Billing</h1>
      <p className="text-gray-500 mb-8">
        Manage your subscription and plan limits.
      </p>

      {status?.subscription && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current Subscription
              <Badge className="capitalize">{status.subscription.status}</Badge>
            </CardTitle>
            <CardDescription>
              {status.subscription.cancel_at_period_end
                ? "Your subscription is set to cancel at the end of the current period."
                : "Renews automatically every month."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className="font-medium capitalize">{status.subscription.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Period ends</span>
              <span className="font-medium">
                {new Date(status.subscription.current_period_end).toLocaleDateString()}
              </span>
            </div>
            {status.usage && (
              <div className="flex justify-between">
                <span className="text-gray-500">AI messages used</span>
                <span className="font-medium">
                  {status.usage.used} / {status.usage.limit}
                </span>
              </div>
            )}
            {!status.subscription.cancel_at_period_end && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={async () => {
                  await fetch("/api/billing/cancel", { method: "POST" });
                  const res = await fetch("/api/billing/status");
                  if (res.ok) setStatus(await res.json());
                }}
              >
                Cancel subscription
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPaid = plan.id !== "free";
          return (
            <Card key={plan.id} className={isCurrent ? "border-blue-500 ring-2 ring-blue-200" : ""}>
              <CardHeader>
                <CardTitle className="capitalize">{plan.name}</CardTitle>
                <div className="text-3xl font-bold">
                  {plan.price_monthly_rub === 0 ? "Free" : `₽${plan.price_monthly_rub}`}
                  {plan.price_monthly_rub !== 0 && (
                    <span className="text-base font-normal text-gray-500">/mo</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.max_services === null
                      ? "Unlimited services"
                      : `${plan.max_services} services`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.ai_messages_per_month.toLocaleString("ru-RU")} AI messages / month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.custom_branding ? "Custom branding" : "Standard branding"}
                  </li>
                </ul>
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Current Plan
                  </Button>
                ) : isPaid ? (
                  <Button
                    className="w-full"
                    disabled={checkingOut !== null}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {checkingOut === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      "Upgrade"
                    )}
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="w-full">
                    Downgrade available soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
    </div>
  );
}
