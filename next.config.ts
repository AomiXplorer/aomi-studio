import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Agent runs stream for a long time; keep responses unbuffered.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
