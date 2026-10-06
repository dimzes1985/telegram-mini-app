"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Settings,
  Briefcase,
  CreditCard,
  Users,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Дашборд",
    short: "Дашборд",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Услуги",
    short: "Услуги",
    href: "/admin/services",
    icon: Briefcase,
  },
  {
    label: "Мастера",
    short: "Мастера",
    href: "/admin/staff",
    icon: Users,
  },
  {
    label: "Бронирования",
    short: "Записи",
    href: "/admin/bookings",
    icon: Calendar,
  },
  {
    label: "Статистика",
    short: "Статистика",
    href: "/admin/stats",
    icon: BarChart3,
    // Reached from the dashboard on phones (the bottom bar has no room).
    desktopOnly: true,
  },
  {
    label: "Оплата",
    short: "Оплата",
    href: "/admin/billing",
    icon: CreditCard,
  },
  {
    label: "Настройки",
    short: "Настройки",
    href: "/admin/settings",
    icon: Settings,
  },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(href));
}

export function Sidebar() {
  const isActive = useIsActive();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-gray-900 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:p-4">
        <div className="mb-8">
          <h1 className="text-xl font-bold">Панель управления</h1>
          <p className="text-sm text-gray-400">Управление бизнесом</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid grid-cols-6">
          {navItems
            .filter((item) => !("desktopOnly" in item && item.desktopOnly))
            .map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-blue-600" : "text-gray-500",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5",
                      active ? "text-blue-600" : "text-gray-400",
                    )}
                  />
                  <span className="truncate">{item.short}</span>
                </Link>
              );
            })}
        </div>
      </nav>
    </>
  );
}
