import { MessengerProvider } from "@/lib/messenger";

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessengerProvider>{children}</MessengerProvider>;
}
