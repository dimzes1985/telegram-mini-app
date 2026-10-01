"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { ServiceForm } from "@/components/admin/service-form";
import { formatPrice } from "@/lib/labels";
import { Service } from "@/types";

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = async () => {
    const res = await fetch("/api/services");
    if (res.ok) {
      const data = await res.json();
      setServices(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch("/api/services")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) setServices(data);
      })
      .finally(() => setLoading(false));
  }, []);

  // Throws with the server message so the form can show it.
  const request = async (url: string, init: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Не удалось сохранить изменения");
    }
    return data;
  };

  const handleCreate = async (data: Partial<Service>) => {
    await request("/api/services", { method: "POST", body: JSON.stringify(data) });
    await fetchServices();
  };

  const handleUpdate = async (id: string, data: Partial<Service>) => {
    // Update in place: keeps the service id and all its bookings.
    await request("/api/services", {
      method: "PATCH",
      body: JSON.stringify({ id, ...data }),
    });
    await fetchServices();
  };

  const handleDelete = async (id: string) => {
    await request(`/api/services?id=${id}`, { method: "DELETE" });
    await fetchServices();
  };

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between sm:mb-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Услуги</h1>
        <ServiceForm onSave={handleCreate} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Услуг пока нет. Добавьте первую услугу, чтобы начать!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {services.map((service) => (
            <Card key={service.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{service.title}</h3>
                    {service.description && (
                      <p className="text-gray-600 text-sm mt-1">
                        {service.description}
                      </p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                      <span>{formatPrice(service.price)}</span>
                      <span>{service.duration_minutes} мин</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <Badge variant={service.active ? "default" : "secondary"}>
                      {service.active ? "Активна" : "Неактивна"}
                    </Badge>
                    <ServiceForm
                      service={service}
                      onSave={(data) => handleUpdate(service.id, data)}
                      onDelete={() => handleDelete(service.id)}
                      trigger={
                        <Button variant="ghost" size="icon">
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
