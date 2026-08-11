import { MessengerProvider } from "@/lib/messenger";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessengerProvider>{children}</MessengerProvider>;
}
