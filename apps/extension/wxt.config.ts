import { createRequire } from "node:module";
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { BANNER_ORIGIN, BANNER_PAGES, DARS_PAGES } from "./lib/temple-urls";

const require = createRequire(import.meta.url);

/** Inter's Latin file, which the Banner overlay registers on Banner pages. */
const OVERLAY_FONT = "fonts/inter-latin-wght-normal.woff2";

/** Host permission for the backend, so the popup and background can call it without CORS. */
function apiHostPermission(): string {
  const url = new URL(
    import.meta.env.WXT_API_ORIGIN || "http://localhost:8000",
  );
  // Match patterns can't carry a port; this covers any port on the host.
  return `${url.protocol}//${url.hostname}/*`;
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // WXT's reload server starts its search at 3000, the website's port.
  dev: { server: { port: 3100 } },
  // A function so .env files are loaded before WXT_API_ORIGIN is read.
  manifest: () => ({
    name: "BetterSSB",
    description:
      "Supercharge Temple University's Self-Service Banner registration",
    permissions: ["storage", "alarms", "notifications", "tabs", "activeTab"],
    host_permissions: [BANNER_PAGES, DARS_PAGES, apiHostPermission()],
    web_accessible_resources: [
      // These match patterns must end in "/*": only the origin counts.
      { resources: [OVERLAY_FONT], matches: [`${BANNER_ORIGIN}/*`] },
    ],
  }),
  hooks: {
    // Content scripts build as one file with every asset inlined, so the
    // overlay's font is copied as a file instead of riding along as a data URL.
    "build:publicAssets": (_wxt, files) => {
      files.push({
        absoluteSrc:
          require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
        relativeDest: OVERLAY_FONT,
      });
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
