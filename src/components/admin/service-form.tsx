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
import { Plus, Pencil, Trash2 } from "lucide-react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave({
        title,
        description,
        price: parseFloat(price),
        duration_minutes: parseInt(duration),
      });
      setOpen(false);
      if (!service) {
        setTitle("");
        setDescription("");
        setPrice("");
        setDuration("30");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{service ? "Edit Service" : "Add Service"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Haircut"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the service"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price ($)</Label>
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
                <Label htmlFor="duration">Duration (min)</Label>
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
            <div className="flex justify-between">
              {service && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={async () => {
                    await onDelete();
                    setOpen(false);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={loading} className={service ? "" : "w-full"}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
