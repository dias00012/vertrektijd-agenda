import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Standaard ".next"; via NEXT_BUILD_DIR kan een losse build-map gekozen worden
  // zodat een verificatie-build een draaiende dev-server niet verstoort.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
};

export default nextConfig;
