"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Loader2, Ticket } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { pluralize } from "@/lib/labels";

interface PlanInfo {
  id: string;
  name: string;
  price_monthly_rub: number;
  ai_messages_per_month: number;
  max_services: number | null;
  max_staff?: number | null;
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
  promo_prices?: Record<string, number>;
}

const FREE_PLAN: PlanInfo = {
  id: "free",
  name: "Бесплатно",
  price_monthly_rub: 0,
  ai_messages_per_month: 50,
  max_services: 3,
  max_staff: 1,
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "активна",
  trialing: "пробный период",
  past_due: "ожидает оплаты",
  cancelled: "отменена",
  expired: "истекла",
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
  // Offer + auto-renewal consent, required before paying.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [unbinding, setUnbinding] = useState(false);
  const [unbindError, setUnbindError] = useState("");
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const [downgrading, setDowngrading] = useState(false);
  const [downgradeNote, setDowngradeNote] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoResult, setPromoResult] = useState<{ ok: boolean; text: string } | null>(null);

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
        body: JSON.stringify({ plan, accept_terms: acceptTerms }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось начать оплату");
        return;
      }
      if (data.confirmation_url) {
        reachGoal("checkout_start", { plan });
        window.location.assign(data.confirmation_url);
      }
    } catch {
      setError("Ошибка соединения");
    } finally {
      setCheckingOut(null);
    }
  };

  const handlePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setPromoBusy(true);
    setPromoResult(null);
    try {
      const res = await fetch("/api/billing/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoResult({ ok: false, text: data.error || "Не удалось применить промокод" });
        return;
      }
      setPromoResult({ ok: true, text: data.message });
      setPromoCode("");
      reachGoal("promo_applied");
      const statusRes = await fetch("/api/billing/status");
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch {
      setPromoResult({ ok: false, text: "Ошибка соединения" });
    } finally {
      setPromoBusy(false);
    }
  };

  const handleDowngrade = async () => {
    setDowngrading(true);
    setError("");
    setDowngradeNote("");
    try {
      const res = await fetch("/api/billing/downgrade", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось изменить тариф");
        return;
      }
      const statusRes = await fetch("/api/billing/status");
      if (statusRes.ok) setStatus(await statusRes.json());
      setDowngradeNote(
        data.scheduled
          ? "Понижение до Free запланировано на конец оплаченного периода."
          : "Тариф изменён на Free."
      );
    } catch {
      setError("Ошибка соединения");
    } finally {
      setDowngrading(false);
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
  const subscription = status?.subscription ?? null;
  const subscriptionActive =
    subscription?.status === "active" || subscription?.status === "trialing";
  const isTrial = subscription?.status === "trialing";
  const promoPrices = status?.promo_prices ?? {};

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 sm:text-3xl">Оплата</h1>
      <p className="text-gray-500 mb-6 sm:mb-8">
        Управление подпиской и лимитами тарифа.
      </p>

      {subscription && subscriptionActive && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Текущая подписка
              <Badge className="capitalize">
                {SUBSCRIPTION_STATUS_LABELS[subscription.status] || subscription.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              {isTrial
                ? "Бесплатный период по промокоду. Чтобы тариф не отключился, оплатите его — оплаченный месяц начнётся после окончания бесплатного."
                : subscription.cancel_at_period_end
                ? "Подписка будет отменена в конце текущего периода."
                : "Автоматически продлевается каждый месяц."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Тариф</span>
              <span className="font-medium capitalize">{subscription.plan}</span>
            </div>
            {subscription.current_period_end && (
              <div className="flex justify-between">
                <span className="text-gray-500">Действует до</span>
                <span className="font-medium">
                  {new Date(subscription.current_period_end).toLocaleDateString("ru-RU")}
                </span>
              </div>
            )}
            {status?.usage && (
              <div className="flex justify-between">
                <span className="text-gray-500">Использовано AI-сообщений</span>
                <span className="font-medium">
                  {status.usage.used} / {status.usage.limit}
                </span>
              </div>
            )}
            {subscription.yookassa_payment_method_id && (
              <div className="p-3 bg-gray-50 rounded-lg mt-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-500" />
                  Привязана карта
                </p>
                {subscription.payment_method?.title && (
                  <p className="text-sm text-gray-600 mt-1">
                    {subscription.payment_method.title}
                    {subscription.payment_method.last4 &&
                      ` •••• ${subscription.payment_method.last4}`}
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
            {!subscription.cancel_at_period_end && (
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

      {subscription && !subscriptionActive && (
        <Card className="mb-8 border-gray-200 bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Подписка не активна
              <Badge variant="secondary" className="capitalize">
                {SUBSCRIPTION_STATUS_LABELS[subscription.status] || subscription.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              Тариф понижен до Free. Услуги, записи и настройки сохранены.
              Оформите тариф заново, чтобы вернуть прежние лимиты.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Предыдущий тариф</span>
              <span className="font-medium capitalize">{subscription.plan}</span>
            </div>
            {subscription.current_period_end && (
              <div className="flex justify-between">
                <span className="text-gray-500">Был активен до</span>
                <span className="font-medium">
                  {new Date(subscription.current_period_end).toLocaleDateString("ru-RU")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handlePromo} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="promo" className="flex items-center gap-2 text-sm font-medium sm:mr-2">
              <Ticket className="h-4 w-4 text-blue-600" />
              Есть промокод?
            </label>
            <input
              id="promo"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Например, START30"
              maxLength={40}
              autoComplete="off"
              className="h-10 flex-1 rounded-md border px-3 text-sm uppercase outline-none focus:ring-2 focus:ring-blue-200"
            />
            <Button type="submit" variant="outline" disabled={promoBusy || !promoCode.trim()}>
              {promoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Применить"}
            </Button>
          </form>
          {promoResult && (
            <p className={`mt-2 text-sm ${promoResult.ok ? "text-green-600" : "text-red-500"}`}>
              {promoResult.text}
            </p>
          )}
        </CardContent>
      </Card>

      <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-3 text-sm leading-snug text-gray-600">
        <input
          type="checkbox"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-blue-600"
        />
        <span>
          Я принимаю{" "}
          <a href="/terms" target="_blank" rel="noopener" className="text-blue-600 underline">
            договор-оферту
          </a>{" "}
          и согласен на автоматическое ежемесячное списание стоимости тарифа с сохранённой
          карты. Отключить автопродление можно в любой момент на этой странице.
        </span>
      </label>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPaid = plan.id !== "free";
          const promoPrice = promoPrices[plan.id];
          // During a free trial the current plan can (and should) be paid for.
          const canPayCurrent = isCurrent && isPaid && isTrial;
          return (
            <Card key={plan.id} className={isCurrent ? "border-blue-500 ring-2 ring-blue-200" : ""}>
              <CardHeader>
                <CardTitle className="capitalize">{plan.name}</CardTitle>
                <div className="text-3xl font-bold">
                  {promoPrice ? (
                    <>
                      <span className="mr-2 text-lg font-normal text-gray-400 line-through">
                        {plan.price_monthly_rub.toLocaleString("ru-RU")} ₽
                      </span>
                      {promoPrice.toLocaleString("ru-RU")} ₽
                    </>
                  ) : plan.price_monthly_rub === 0 ? "Бесплатно" : `${plan.price_monthly_rub.toLocaleString("ru-RU")} ₽`}
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
                  {plan.max_staff !== undefined && (
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      {plan.max_staff === null
                        ? "Безлимитно мастеров"
                        : plan.max_staff === 1
                          ? "1 мастер"
                          : `До ${plan.max_staff} мастеров`}
                    </li>
                  )}
                </ul>
                {promoPrice && (
                  <Badge variant="secondary">Ваша цена по промокоду</Badge>
                )}
                {isCurrent && !canPayCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Текущий тариф
                  </Button>
                ) : isPaid ? (
                  <Button
                    className="w-full"
                    disabled={checkingOut !== null || !acceptTerms}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {checkingOut === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Перенаправление...
                      </>
                    ) : canPayCurrent ? (
                      "Оплатить"
                    ) : (
                      "Улучшить"
                    )}
                  </Button>
                ) : status?.subscription?.cancel_at_period_end ? (
                  <Button variant="outline" disabled className="w-full">
                    Понижение запланировано
                  </Button>
                ) : status?.subscription ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={downgrading}
                    onClick={handleDowngrade}
                  >
                    {downgrading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Понижаем...
                      </>
                    ) : (
                      "Понизить до Free"
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
      {downgradeNote && (
        <p className="text-sm text-green-600 mt-4">{downgradeNote}</p>
      )}
    </div>
  );
}
