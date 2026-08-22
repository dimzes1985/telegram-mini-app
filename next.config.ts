import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached from the platform preview domain
  allowedDevOrigins: ["*.monkeycode-ai.live"],
};

export default nextConfig;
