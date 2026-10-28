import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native / browser-driven packages must not be bundled by the server compiler.
  serverExternalPackages: ["@node-rs/argon2", "playwright-core", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
