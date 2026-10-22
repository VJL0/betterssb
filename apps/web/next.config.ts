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
  async headers() {
    // Lets Sentry's browser profiler use the JS Self-Profiling API.
    return [
      {
        source: "/:path*",
        headers: [{ key: "Document-Policy", value: "js-profiling" }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "victor-0z",
  // The release (named for the commit on Vercel) is created in both projects,
  // since the API tags its events with the same commit. On Vercel the plugin
  // also attaches commits to production releases and records each deploy.
  project: ["betterssb-web", "betterssb-api"],
  // Uploads source maps and creates the release on production builds; without
  // it, builds still pass but stack traces stay minified.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Sends browser events through the site, past ad blockers.
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
