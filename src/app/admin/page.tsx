import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle, BarChart3, ChevronRight } from "lucide-react";
import { nowInTimeZone } from "@/lib/business-time";
import { bookingStatusLabel } from "@/lib/labels";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getDemoState } from "@/lib/demo-store";
import { AppLinksCard } from "@/components/admin/app-links-card";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const demo = !isSupabaseConfigured();
  const demoBookings = demo ? getDemoState().bookings : [];

  const { data: allBookings } = demo
    ? { data: demoBookings }
    : await supabase
        .from("bookings")
        .select("status, booking_date")
        .eq("user_id", user.id);

  const totalBookings = allBookings?.length || 0;
  const pendingBookings =
    allBookings?.filter((b) => b.status === "pending").length || 0;
  const confirmedBookings =
    allBookings?.filter((b) => b.status === "confirmed").length || 0;

  const today = nowInTimeZone().date;
  const todayBookings =
    allBookings?.filter((b) => b.booking_date === today).length || 0;

  // Get recent bookings
  const { data: recentBookings } = demo
    ? { data: demoBookings.slice(0, 5) }
    : await supabase
        .from("bookings")
        .select("*, service:services(title)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 sm:text-3xl sm:mb-8">Дашборд</h1>
      {demo && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Демо-режим: Supabase не настроен, показаны тестовые данные. Для боевого входа добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.
        </p>
      )}

      <AppLinksCard />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:gap-4 sm:mb-8 lg:grid-cols-4 lg:gap-6">
        <Link href="/admin/bookings?filter=all" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 sm:text-sm">
                Всего бронирований
              </CardTitle>
              <Calendar className="h-4 w-4 text-gray-400 sm:h-5 sm:w-5" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold sm:text-3xl">{totalBookings}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/bookings?filter=pending" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 sm:text-sm">
                Ожидают
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-500 sm:h-5 sm:w-5" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 sm:text-3xl">
                {pendingBookings}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/bookings?filter=confirmed" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 sm:text-sm">
                Подтверждено
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500 sm:h-5 sm:w-5" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 sm:text-3xl">
                {confirmedBookings}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/bookings?filter=today" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-gray-600 sm:text-sm">
                На сегодня
              </CardTitle>
              <Calendar className="h-4 w-4 text-blue-500 sm:h-5 sm:w-5" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 sm:text-3xl">
                {todayBookings}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Link
        href="/admin/stats"
        className="mb-6 flex items-center justify-between rounded-xl border bg-white px-4 py-3 transition-shadow hover:shadow-md sm:mb-8"
      >
        <span className="flex items-center gap-2 font-medium">
          <BarChart3 className="h-5 w-5 text-blue-500" />
          Статистика: выручка, отмены, популярные услуги
        </span>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </Link>

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
                  className="flex flex-col gap-2 p-4 bg-gray-50 rounded-lg sm:flex-row sm:items-center sm:justify-between"
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
