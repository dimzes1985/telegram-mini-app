import { MessengerProvider } from "@/lib/messenger";

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessengerProvider>{children}</MessengerProvider>;
}
