import { createRequire } from "node:module";
import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { originMatchPattern } from "./lib/match-pattern";
import {
  BANNER_ORIGIN,
  BANNER_PAGES,
  DARS_PAGES,
  SELF_SERVICE_PAGES,
  TUPORTAL_PAGES,
} from "./lib/temple-urls";

const require = createRequire(import.meta.url);

/** Inter's Latin file, which the Banner overlay registers on Banner pages. */
const OVERLAY_FONT = "fonts/inter-latin-wght-normal.woff2";

/** Host permission for the backend, so the popup and background can call it without CORS. */
function apiHostPermission(): string {
  return originMatchPattern(
    import.meta.env.WXT_API_ORIGIN || "http://localhost:8000",
  );
}

/**
 * The store zip must reach the production website and API over HTTPS: the
 * web bridge and the API host permission come from these, and the Chrome Web
 * Store requires user data to travel encrypted.
 */
function assertStoreOrigins(): void {
  for (const name of ["WXT_API_ORIGIN", "WXT_WEB_ORIGIN"] as const) {
    const origin: string | undefined = import.meta.env[name];
    if (!origin?.startsWith("https://")) {
      throw new Error(
        `Set ${name} to the production https:// origin (in .env.production) before zipping for the Chrome Web Store.`,
      );
    }
  }
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // WXT's reload server starts its search at 3000, the website's port.
  dev: { server: { port: 3100 } },
  // A function so .env files are loaded before WXT_API_ORIGIN is read.
  manifest: () => ({
    name: "BetterSSB",
    // At most 132 characters.
    description:
      "Ratings, seats and auto-register for Temple University's Self-Service Banner. Independent; not affiliated with Temple or Ellucian.",
    permissions: ["storage", "alarms", "notifications"],
    host_permissions: [
      BANNER_PAGES,
      // Read-only: the student's academic transcript.
      SELF_SERVICE_PAGES,
      DARS_PAGES,
      // Read-only: the priority registration countdown, for the auto-register time.
      TUPORTAL_PAGES,
      apiHostPermission(),
    ],
    web_accessible_resources: [
      // These match patterns must end in "/*": only the origin counts.
      { resources: [OVERLAY_FONT], matches: [`${BANNER_ORIGIN}/*`] },
    ],
  }),
  hooks: {
    "zip:start": assertStoreOrigins,
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
