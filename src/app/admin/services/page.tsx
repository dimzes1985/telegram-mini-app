"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { ServiceForm } from "@/components/admin/service-form";
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
    fetchServices();
  }, []);

  const handleCreate = async (data: Partial<Service>) => {
    await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchServices();
  };

  const handleUpdate = async (id: string, data: Partial<Service>) => {
    // For simplicity, delete and recreate (in real app, use PATCH)
    await fetch(`/api/services?id=${id}`, { method: "DELETE" });
    await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/services?id=${id}`, { method: "DELETE" });
    fetchServices();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Services</h1>
        <ServiceForm onSave={handleCreate} />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No services yet. Add your first service to get started!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {services.map((service) => (
            <Card key={service.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{service.title}</h3>
                    {service.description && (
                      <p className="text-gray-600 text-sm mt-1">
                        {service.description}
                      </p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                      <span>${service.price}</span>
                      <span>{service.duration_minutes} min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={service.active ? "default" : "secondary"}>
                      {service.active ? "Active" : "Inactive"}
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
