import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  webpack(config, { dev }) {
    if (dev)
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/data/**",
          "**/.playwright-cli/**",
          "**/output/**",
          "**/docs/**",
        ],
      };
    return config;
  },
  experimental: { cpus: 2 },
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      ...[
        "/verify-email",
        "/reset-password",
        "/invite",
        "/pilot/:path*",
        "/api/pilot/:path*",
        "/api/account/:path*",
        "/api/invitations/:path*",
        "/api/onboarding/:path*",
      ].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
    ];
  },
};
export default config;
