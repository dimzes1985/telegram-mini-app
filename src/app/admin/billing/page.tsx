"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { pluralize } from "@/lib/labels";

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
    yookassa_payment_method_id: string | null;
    payment_method?: {
      title?: string | null;
      card_type?: string | null;
      last4?: string | null;
    } | null;
  } | null;
  usage: { plan: string; used: number; limit: number; remaining: number } | null;
  available_plans: PlanInfo[];
}

const FREE_PLAN: PlanInfo = {
  id: "free",
  name: "Бесплатно",
  price_monthly_rub: 0,
  ai_messages_per_month: 50,
  max_services: 3,
  custom_branding: false,
};

export default function BillingPage() {
  return (
    <Suspense fallback={<div>Загрузка...</div>}>
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
  const [unbinding, setUnbinding] = useState(false);
  const [unbindError, setUnbindError] = useState("");
  const [confirmUnbind, setConfirmUnbind] = useState(false);

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
        setError(data.error || "Не удалось начать оплату");
        return;
      }
      if (data.confirmation_url) {
        window.location.assign(data.confirmation_url);
      }
    } catch {
      setError("Ошибка соединения");
    } finally {
      setCheckingOut(null);
    }
  };

  const handleUnbind = async () => {
    setUnbinding(true);
    setUnbindError("");
    try {
      const res = await fetch("/api/billing/payment-method/unbind", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setUnbindError(data.error || "Не удалось отвязать карту");
        return;
      }
      const statusRes = await fetch("/api/billing/status");
      if (statusRes.ok) setStatus(await statusRes.json());
      setConfirmUnbind(false);
    } catch {
      setUnbindError("Ошибка соединения");
    } finally {
      setUnbinding(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Загрузка...</div>;
  }

  // available_plans already includes the free plan (PLANS contains it),
  // so only fall back to FREE_PLAN when the API returns nothing.
  const plans = status
    ? status.available_plans.length > 0
      ? [...status.available_plans].sort((a, b) => a.price_monthly_rub - b.price_monthly_rub)
      : [FREE_PLAN]
    : [FREE_PLAN];
  const currentPlan = status?.current_plan || "free";

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Оплата</h1>
      <p className="text-gray-500 mb-8">
        Управление подпиской и лимитами тарифа.
      </p>

      {status?.subscription && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Текущая подписка
              <Badge className="capitalize">{status.subscription.status}</Badge>
            </CardTitle>
            <CardDescription>
              {status.subscription.cancel_at_period_end
                ? "Подписка будет отменена в конце текущего периода."
                : "Автоматически продлевается каждый месяц."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Тариф</span>
              <span className="font-medium capitalize">{status.subscription.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Действует до</span>
              <span className="font-medium">
                {new Date(status.subscription.current_period_end).toLocaleDateString("ru-RU")}
              </span>
            </div>
            {status.usage && (
              <div className="flex justify-between">
                <span className="text-gray-500">Использовано AI-сообщений</span>
                <span className="font-medium">
                  {status.usage.used} / {status.usage.limit}
                </span>
              </div>
            )}
            {status.subscription.yookassa_payment_method_id && (
              <div className="p-3 bg-gray-50 rounded-lg mt-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-500" />
                  Привязана карта
                </p>
                {status.subscription.payment_method?.title && (
                  <p className="text-sm text-gray-600 mt-1">
                    {status.subscription.payment_method.title}
                    {status.subscription.payment_method.last4 &&
                      ` •••• ${status.subscription.payment_method.last4}`}
                  </p>
                )}
                {!confirmUnbind ? (
                  <Button
                    variant="outline"
                    className="mt-3"
                    disabled={unbinding}
                    onClick={() => setConfirmUnbind(true)}
                  >
                    Отвязать карту
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-red-600">
                      После отвязки автопродление подписки будет остановлено.
                      Вы сможете снова оплатить тариф вручную.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        disabled={unbinding}
                        onClick={handleUnbind}
                      >
                        {unbinding ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Отвязываем...
                          </>
                        ) : (
                          "Подтвердить отвязку"
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={unbinding}
                        onClick={() => setConfirmUnbind(false)}
                      >
                        Отмена
                      </Button>
                    </div>
                    {unbindError && (
                      <p className="text-sm text-red-500">{unbindError}</p>
                    )}
                  </div>
                )}
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
                Отменить подписку
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
                  {plan.price_monthly_rub === 0 ? "Бесплатно" : `${plan.price_monthly_rub.toLocaleString("ru-RU")} ₽`}
                  {plan.price_monthly_rub !== 0 && (
                    <span className="text-base font-normal text-gray-500">/мес</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.max_services === null
                      ? "Безлимитные услуги"
                      : `${plan.max_services} ${pluralize(plan.max_services, "услуга", "услуги", "услуг")}`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.ai_messages_per_month.toLocaleString("ru-RU")} AI-сообщений в месяц
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    {plan.custom_branding ? "Свой брендинг" : "Стандартный брендинг"}
                  </li>
                </ul>
                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Текущий тариф
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
                        Перенаправление...
                      </>
                    ) : (
                      "Улучшить"
                    )}
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="w-full">
                    Понижение тарифа будет доступно позже
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
