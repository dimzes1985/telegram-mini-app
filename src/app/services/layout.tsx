import { MessengerProvider } from "@/lib/messenger";

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessengerProvider>{children}</MessengerProvider>;
}
