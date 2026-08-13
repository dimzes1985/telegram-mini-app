import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle } from "lucide-react";
import { bookingStatusLabel } from "@/lib/labels";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get booking stats
  const { data: allBookings } = await supabase
    .from("bookings")
    .select("status, booking_date")
    .eq("user_id", user.id);

  const totalBookings = allBookings?.length || 0;
  const pendingBookings =
    allBookings?.filter((b) => b.status === "pending").length || 0;
  const confirmedBookings =
    allBookings?.filter((b) => b.status === "confirmed").length || 0;

  const today = new Date().toISOString().split("T")[0];
  const todayBookings =
    allBookings?.filter((b) => b.booking_date === today).length || 0;

  // Get recent bookings
  const { data: recentBookings } = await supabase
    .from("bookings")
    .select("*, service:services(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Дашборд</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Всего бронирований
            </CardTitle>
            <Calendar className="h-5 w-5 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalBookings}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Ожидают
            </CardTitle>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              {pendingBookings}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Подтверждено
            </CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {confirmedBookings}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              На сегодня
            </CardTitle>
            <Calendar className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {todayBookings}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Bookings */}
      <Card>
        <CardHeader>
          <CardTitle>Последние бронирования</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBookings && recentBookings.length > 0 ? (
            <div className="space-y-4">
              {recentBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{booking.customer_name}</p>
                    <p className="text-sm text-gray-600">
                      {booking.service?.title} • {booking.booking_date}{" "}
                      в {booking.booking_time}
                    </p>
                  </div>
                  <Badge
                    variant={
                      booking.status === "confirmed"
                        ? "default"
                        : booking.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {bookingStatusLabel(booking.status)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Бронирований пока нет. Поделитесь своим Телеграм мини-приложением!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
