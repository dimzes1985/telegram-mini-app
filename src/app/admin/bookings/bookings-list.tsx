"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";
import { Booking } from "@/types";

export function BookingsListView() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchBookings = async () => {
    const res = await fetch("/api/bookings");
    if (res.ok) {
      const data = await res.json();
      setBookings(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleStatusUpdate = async (id: string, status: string) => {
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchBookings();
  };

  const filteredBookings =
    filter === "all"
      ? bookings
      : bookings.filter((b) => b.status === filter);

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {["all", "pending", "confirmed", "cancelled"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No bookings found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{booking.customer_name}</h3>
                    <p className="text-sm text-gray-600">
                      {(booking.service as any)?.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {booking.booking_date} at {booking.booking_time}
                    </p>
                    {booking.customer_phone && (
                      <p className="text-sm text-gray-500">
                        Phone: {booking.customer_phone}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge
                      variant={
                        booking.status === "confirmed"
                          ? "default"
                          : booking.status === "cancelled"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {booking.status}
                    </Badge>
                    {booking.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusUpdate(booking.id, "confirmed")
                          }
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleStatusUpdate(booking.id, "cancelled")
                          }
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
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
