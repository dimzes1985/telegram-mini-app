import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/mobile/pwa-register";

export const metadata: Metadata = {
  title: "Slot — запись на услуги",
  description: "Мобильное приложение для записи к салонам, студиям и мастерам",
  applicationName: "Slot",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Slot",
    statusBarStyle: "black-translucent",
    startupImage: [
      {
        url: "/icons/icon-512.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      { url: "/icons/icon-512.png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B1220",
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}
