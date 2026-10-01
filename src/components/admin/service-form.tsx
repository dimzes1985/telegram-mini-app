"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { Service } from "@/types";

interface ServiceFormProps {
  service?: Service;
  onSave: (data: Partial<Service>) => Promise<void>;
  onDelete?: () => Promise<void>;
  trigger?: React.ReactNode;
}

export function ServiceForm({ service, onSave, onDelete, trigger }: ServiceFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(service?.title || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price?.toString() || "");
  const [duration, setDuration] = useState(
    service?.duration_minutes?.toString() || "30"
  );
  const [active, setActive] = useState(service?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSave({
        title,
        description,
        price: parseFloat(price),
        duration_minutes: parseInt(duration),
        active,
      });
      setOpen(false);
      if (!service) {
        setTitle("");
        setDescription("");
        setPrice("");
        setDuration("30");
        setActive(true);
      }
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
            <Plus className="h-4 w-4 mr-2" />
            Добавить услугу
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{service ? "Редактировать услугу" : "Добавить услугу"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Стрижка"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Краткое описание услуги"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Цена (₽)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <Label htmlFor="duration">Длительность (мин)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="5"
                  step="5"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="active">Доступна для записи</Label>
                <p className="text-xs text-gray-500">
                  Неактивная услуга скрыта от клиентов, но записи сохраняются
                </p>
              </div>
              <Switch id="active" checked={active} onCheckedChange={setActive} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-between">
              {service && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={loading}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Удалить услугу? Существующие записи клиентов сохранятся, но записаться на неё больше будет нельзя."
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
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить
                </Button>
              )}
              <Button type="submit" disabled={loading} className={service ? "" : "w-full"}>
                {loading ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
