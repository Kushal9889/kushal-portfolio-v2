import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent route needs a server runtime, so this is not a static export.
  // That is also why GitHub Pages cannot host this app.
  reactStrictMode: true,
  // Dynamic corpus paths must not pull CDN media or local reports into functions.
  outputFileTracingExcludes: {
    "/*": ["./public/**/*", "./docs/**/*", "./.claude/**/*", "./.netlify/**/*", "./.cache/**/*", "./tests/**/*", "./scripts/**/*", "./release/**/*"],
  },
  outputFileTracingIncludes: {
    "/*": ["./content/**/*", "./lib/agent/calibration.json"],
  },
  poweredByHeader: false,
  // The round N in the corner is Next's own dev tool, not part of the site; it sat on top of the contact dock.
  devIndicators: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ],
};

export default config;
