import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached from the platform preview domain
  allowedDevOrigins: ["*.monkeycode-ai.live"],
  // API answers (free slots, bookings) must never be cached by the
  // Telegram / MAX webviews or proxies, otherwise a time already booked from
  // another messenger could still look free.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
