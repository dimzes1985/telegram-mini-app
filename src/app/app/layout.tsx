import { TelegramProvider } from "@/lib/telegram";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TelegramProvider>{children}</TelegramProvider>;
}
