"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import type { Service, Staff } from "@/types";

const DAYS = [
  ["monday", "Пн"],
  ["tuesday", "Вт"],
  ["wednesday", "Ср"],
  ["thursday", "Чт"],
  ["friday", "Пт"],
  ["saturday", "Сб"],
  ["sunday", "Вс"],
] as const;

type Hours = NonNullable<Staff["working_hours"]>;

function defaultHours(): Hours {
  return Object.fromEntries(
    DAYS.map(([day], i) => [day, { start: "09:00", end: "18:00", enabled: i < 5 }])
  );
}

export interface StaffFormData {
  name: string;
  description: string | null;
  service_ids: string[];
  working_hours: Hours | null;
  active: boolean;
}

interface StaffFormProps {
  member?: Staff;
  services: Service[];
  onSave: (data: StaffFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  trigger?: React.ReactNode;
}

export function StaffForm({ member, services, onSave, onDelete, trigger }: StaffFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(member?.name ?? "");
  const [description, setDescription] = useState(member?.description ?? "");
  const [allServices, setAllServices] = useState((member?.service_ids.length ?? 0) === 0);
  const [serviceIds, setServiceIds] = useState<string[]>(member?.service_ids ?? []);
  const [ownHours, setOwnHours] = useState(Boolean(member?.working_hours));
  const [hours, setHours] = useState<Hours>(member?.working_hours ?? defaultHours());
  const [active, setActive] = useState(member?.active ?? true);

  const reset = () => {
    setName("");
    setDescription("");
    setAllServices(true);
    setServiceIds([]);
    setOwnHours(false);
    setHours(defaultHours());
    setActive(true);
  };

  const toggleService = (id: string) =>
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const updateDay = (day: string, patch: Partial<Hours[string]>) =>
    setHours((h) => ({
      ...h,
      [day]: {
        ...((h[day] as Hours[string] | undefined) ?? { start: "09:00", end: "18:00", enabled: false }),
        ...patch,
      },
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allServices && serviceIds.length === 0) {
      setError("Выберите хотя бы одну услугу или включите «Все услуги».");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSave({
        name,
        description: description || null,
        service_ids: allServices ? [] : serviceIds,
        working_hours: ownHours ? hours : null,
        active,
      });
      setOpen(false);
      if (!member) reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={trigger ? "cursor-pointer" : "w-full cursor-pointer sm:w-auto"}
      >
        {trigger || (
          <Button className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Добавить мастера
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{member ? "Редактировать мастера" : "Добавить мастера"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="staff-name">Имя</Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Анна или Кабинет 1"
                required
              />
            </div>
            <div>
              <Label htmlFor="staff-description">Описание</Label>
              <Textarea
                id="staff-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например: топ-стилист, стаж 7 лет"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="staff-all-services">Все услуги</Label>
                <Switch
                  id="staff-all-services"
                  checked={allServices}
                  onCheckedChange={setAllServices}
                />
              </div>
              {!allServices && (
                <div className="space-y-1 rounded-md border p-3">
                  {services.length === 0 && (
                    <p className="text-sm text-gray-500">Сначала добавьте услуги.</p>
                  )}
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={serviceIds.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      {service.title}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="staff-own-hours">Свой график</Label>
                  <p className="text-xs text-gray-500">
                    Выключено — работает по общему режиму работы из настроек
                  </p>
                </div>
                <Switch id="staff-own-hours" checked={ownHours} onCheckedChange={setOwnHours} />
              </div>
              {ownHours && (
                <div className="space-y-2 rounded-md border p-3">
                  {DAYS.map(([day, label]) => {
                    const d = hours[day] ?? { start: "09:00", end: "18:00", enabled: false };
                    return (
                      <div key={day} className="flex flex-wrap items-center gap-2">
                        <span className="w-6 text-sm font-medium">{label}</span>
                        <Switch
                          checked={d.enabled}
                          onCheckedChange={(enabled) => updateDay(day, { enabled })}
                        />
                        {d.enabled ? (
                          <>
                            <Input
                              type="time"
                              value={d.start}
                              onChange={(e) => updateDay(day, { start: e.target.value })}
                              className="w-28"
                            />
                            <span className="text-gray-500">–</span>
                            <Input
                              type="time"
                              value={d.end}
                              onChange={(e) => updateDay(day, { end: e.target.value })}
                              className="w-28"
                            />
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">выходной</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="staff-active">Принимает записи</Label>
                <p className="text-xs text-gray-500">
                  Выключите на время отпуска — мастер скроется от клиентов
                </p>
              </div>
              <Switch id="staff-active" checked={active} onCheckedChange={setActive} />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-between">
              {member && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Удалить мастера? Его прошлые записи сохранятся, но записаться к нему будет нельзя."
                      )
                    ) {
                      return;
                    }
                    setError(null);
                    try {
                      await onDelete();
                      setOpen(false);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Не удалось удалить");
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </Button>
              )}
              <Button type="submit" disabled={loading} className={member ? "" : "w-full"}>
                {loading ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
