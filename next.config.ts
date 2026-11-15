import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile sets NEXT_OUTPUT=standalone to get a self-contained server
  // in .next/standalone. Regular `pnpm build && pnpm start` doesn't need it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
