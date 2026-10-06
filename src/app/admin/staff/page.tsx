"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { StaffForm, type StaffFormData } from "@/components/admin/staff-form";
import type { Service, Staff } from "@/types";

interface StaffResponse {
  staff: Staff[];
  max_staff: number | null;
  plan: string;
}

export default function StaffPage() {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [staffRes, servicesRes] = await Promise.all([
      fetch("/api/staff", { cache: "no-store" }),
      fetch("/api/services", { cache: "no-store" }),
    ]);
    const staffJson = await staffRes.json().catch(() => ({}));
    if (staffRes.ok) {
      setData(staffJson);
      setLoadError(null);
    } else {
      setLoadError(staffJson.error || "Не удалось загрузить мастеров");
    }
    if (servicesRes.ok) setServices(await servicesRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/staff", { cache: "no-store" }),
      fetch("/api/services", { cache: "no-store" }),
    ])
      .then(async ([staffRes, servicesRes]) => {
        if (cancelled) return;
        const staffJson = await staffRes.json().catch(() => ({}));
        if (staffRes.ok) setData(staffJson);
        else setLoadError(staffJson.error || "Не удалось загрузить мастеров");
        if (servicesRes.ok) setServices(await servicesRes.json());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = async (url: string, init: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Не удалось сохранить изменения");
    return json;
  };

  const create = async (form: StaffFormData) => {
    await request("/api/staff", { method: "POST", body: JSON.stringify(form) });
    await load();
  };
  const update = async (id: string, form: StaffFormData) => {
    await request("/api/staff", { method: "PATCH", body: JSON.stringify({ id, ...form }) });
    await load();
  };
  const remove = async (id: string) => {
    await request(`/api/staff?id=${id}`, { method: "DELETE" });
    await load();
  };

  const staff = data?.staff ?? [];
  const serviceTitle = (id: string) => services.find((s) => s.id === id)?.title;
  const limitReached = data?.max_staff != null && staff.length >= data.max_staff;

  return (
    <div>
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold sm:text-3xl">Мастера</h1>
        {!loadError && !limitReached && <StaffForm services={services} onSave={create} />}
      </div>
      <p className="mb-6 text-sm text-gray-500 sm:mb-8">
        Добавьте мастеров или кабинеты — клиенты смогут записываться к разным мастерам на одно и то
        же время. Пока мастеров нет, запись работает как раньше: одна запись на одно время.
        {data?.max_staff != null &&
          ` Тариф ${data.plan}: до ${data.max_staff} ${data.max_staff === 1 ? "мастера" : "мастеров"}.`}
      </p>

      {limitReached && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Достигнут лимит мастеров вашего тарифа. Чтобы добавить ещё, перейдите на старший тариф в
          разделе «Оплата».
        </p>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Загрузка...</div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-red-500">{loadError}</CardContent>
        </Card>
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Мастеров пока нет. Добавьте первого, если в одно время у вас работают несколько
            человек.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {staff.map((member) => (
            <Card key={member.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{member.name}</h3>
                    {member.description && (
                      <p className="mt-1 text-sm text-gray-600">{member.description}</p>
                    )}
                    <p className="mt-2 text-sm text-gray-500">
                      Услуги:{" "}
                      {member.service_ids.length === 0
                        ? "все"
                        : member.service_ids.map(serviceTitle).filter(Boolean).join(", ") ||
                          "—"}
                    </p>
                    <p className="text-sm text-gray-500">
                      График: {member.working_hours ? "свой" : "общий режим работы"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <Badge variant={member.active ? "default" : "secondary"}>
                      {member.active ? "Принимает записи" : "Не принимает"}
                    </Badge>
                    <StaffForm
                      member={member}
                      services={services}
                      onSave={(form) => update(member.id, form)}
                      onDelete={() => remove(member.id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Редактировать">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
