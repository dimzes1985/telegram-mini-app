"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Closure {
  id: string;
  date: string;
  reason: string | null;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "short",
    timeZone: "UTC",
  });
}

// Owner UI for days off / holidays (business_closures).
export function ClosuresCard() {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/closures")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && Array.isArray(data)) setClosures(data);
        else setError(data?.error || "Не удалось загрузить выходные");
      })
      .catch(() => !cancelled && setError("Ошибка соединения"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function add() {
    if (!date) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Не удалось сохранить");
        return;
      }
      setClosures((list) =>
        [...list, { id: data.id, date: data.date, reason: data.reason }].sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      );
      if (data.existing_bookings > 0) {
        setNotice(
          `На ${formatDate(data.date)} уже есть записей: ${data.existing_bookings}. Они не отменены автоматически — проверьте раздел «Записи».`
        );
      }
      setDate("");
      setReason("");
    } catch {
      setError("Ошибка соединения");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/closures?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setClosures((list) => list.filter((c) => c.id !== id));
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Не удалось удалить");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          Выходные и праздники
        </CardTitle>
        <CardDescription>
          Отдельные дни, когда вы не работаете. Клиенты не смогут записаться на эти даты. Сохраняется сразу.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div>
            <Label htmlFor="closure-date">Дата</Label>
            <Input
              id="closure-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="sm:w-44"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="closure-reason">Причина (необязательно)</Label>
            <Input
              id="closure-reason"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: Новый год"
            />
          </div>
          <Button type="button" onClick={add} disabled={!date || saving}>
            {saving ? "Сохранение..." : "Добавить"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm text-amber-600">{notice}</p>}

        {closures.length === 0 ? (
          <p className="text-sm text-gray-500">Выходных дней не запланировано.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {closures.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{formatDate(c.date)}</p>
                  {c.reason && <p className="text-xs text-gray-500">{c.reason}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(c.id)}
                  aria-label="Удалить выходной"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
