"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/labels";
import {
  STATS_PERIODS,
  type BusinessStats,
  type CountItem,
  type StatsPeriod,
} from "@/lib/stats";

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function Kpi({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-gray-500 sm:text-sm">{title}</p>
        <p className={cn("mt-1 text-2xl font-bold sm:text-3xl", tone)}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Horizontal bars: label, count and revenue.
function BarList({ items, empty }: { items: CountItem[]; empty: string }) {
  if (items.length === 0)
    return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-gray-500">
              {item.count} · {formatPrice(item.revenue)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-blue-500"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Vertical bars for a series (days, hours, weekdays).
function Columns({
  data,
  height = 120,
}: {
  data: Array<{ key: string; label: string; count: number; title: string }>;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((d) => (
          <div
            key={d.key}
            className="flex h-full flex-1 flex-col justify-end"
            title={d.title}
          >
            <div
              className={cn(
                "rounded-t",
                d.count ? "bg-blue-500" : "bg-gray-100",
              )}
              style={{
                height: d.count
                  ? `${Math.max((d.count / max) * 100, 4)}%`
                  : "4%",
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="flex-1 text-center text-[10px] text-gray-500"
          >
            {i % showEvery === 0 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState<StatsPeriod>("month");
  const [loaded, setLoaded] = useState<{
    period: StatsPeriod;
    stats: BusinessStats | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stats?period=${period}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        setLoaded(
          res.ok
            ? { period, stats: json, error: null }
            : {
                period,
                stats: null,
                error: json.error || "Не удалось загрузить статистику",
              },
        );
      })
      .catch(() => {
        if (!cancelled)
          setLoaded({ period, stats: null, error: "Ошибка соединения" });
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const current = loaded?.period === period ? loaded : null;
  const stats = current?.stats ?? null;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Статистика</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {STATS_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              p.id === period
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!current ? (
        <div className="py-12 text-center text-gray-500">Загрузка...</div>
      ) : current.error || !stats ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-500">
            {current.error}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Период: {formatShortDate(stats.from)}.{stats.from.slice(0, 4)} —{" "}
            {formatShortDate(stats.to)}.{stats.to.slice(0, 4)} (по дате визита)
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              title="Записей"
              value={String(stats.active)}
              hint={`подтверждено ${stats.confirmed}, ожидают ${stats.pending}`}
            />
            <Kpi
              title="Выручка"
              value={formatPrice(stats.revenue)}
              hint="подтверждённые визиты, которые уже прошли"
              tone="text-green-600"
            />
            <Kpi
              title="Ожидается"
              value={formatPrice(stats.expectedRevenue)}
              hint="будущие записи в этом периоде"
              tone="text-blue-600"
            />
            <Kpi
              title="Отмены"
              value={`${stats.cancelled} (${stats.cancelRate}%)`}
              hint={`клиентом ${stats.cancelledByCustomer}, вами ${stats.cancelledByOwner}`}
              tone={stats.cancelRate >= 20 ? "text-red-600" : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Записи по дням</CardTitle>
            </CardHeader>
            <CardContent>
              <Columns
                data={stats.byDay.map((d) => ({
                  key: d.date,
                  label: formatShortDate(d.date),
                  count: d.count,
                  title: `${formatShortDate(d.date)}: ${d.count}`,
                }))}
              />
              {stats.averageCheck > 0 && (
                <p className="mt-3 text-sm text-gray-500">
                  Средний чек:{" "}
                  <span className="font-medium text-gray-900">
                    {formatPrice(stats.averageCheck)}
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Популярные услуги</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  items={stats.services}
                  empty="Записей за период нет."
                />
              </CardContent>
            </Card>

            {stats.staff.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Мастера</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarList items={stats.staff} empty="Записей за период нет." />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Откуда записываются</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={stats.sources} empty="Записей за период нет." />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Популярные дни недели
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Columns
                  height={90}
                  data={stats.weekdays.map((d) => ({
                    key: d.day,
                    label: d.label,
                    count: d.count,
                    title: `${d.label}: ${d.count}`,
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Популярное время</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.hours.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Записей за период нет.
                  </p>
                ) : (
                  <Columns
                    height={90}
                    data={stats.hours.map((h) => ({
                      key: String(h.hour),
                      label: `${h.hour}`,
                      count: h.count,
                      title: `${h.hour}:00–${h.hour + 1}:00: ${h.count}`,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
