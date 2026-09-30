import { Sidebar } from "@/components/admin/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 lg:flex-row">
      <Sidebar />
      <main className="flex-1 p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main>
    </div>
  );
}
