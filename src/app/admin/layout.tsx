import type { Metadata, Viewport } from "next";
import { Sidebar } from "@/components/admin/sidebar";
import { AdminPwa } from "@/components/admin/admin-pwa";

export const metadata: Metadata = {
  title: "Slot Админ",
  applicationName: "Slot Админ",
  manifest: "/admin-manifest.json",
  appleWebApp: { capable: true, title: "Slot Админ", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      <AdminPwa />
      <Sidebar />
      <main className="flex-1 p-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6 lg:p-8 lg:pb-8">
        {children}
      </main>
    </div>
  );
}
