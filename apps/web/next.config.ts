import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * The FastAPI server. The site calls it same-origin at /api (the API has no
 * CORS), so every /api request is proxied there. Read at build time.
 */
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default withSentryConfig(nextConfig, {
  org: "victor-0z",
  project: "betterssb-web",
  // Uploads source maps on production builds; without it, builds still pass
  // but stack traces stay minified.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Sends browser events through the site, past ad blockers.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
