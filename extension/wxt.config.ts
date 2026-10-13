import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

/** Host permission for the backend, so the popup and background can call it without CORS. */
function apiHostPermission(): string {
  const url = new URL(
    import.meta.env.WXT_API_URL || "http://localhost:8000/api",
  );
  // Match patterns can't carry a port; this covers any port on the host.
  return `${url.protocol}//${url.hostname}/*`;
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // A function so .env files are loaded before WXT_API_URL is read.
  manifest: () => ({
    name: "BetterSSB",
    description:
      "Supercharge your university's Self-Service Banner registration",
    permissions: [
      "storage",
      "alarms",
      "notifications",
      "identity",
      "tabs",
      "activeTab",
    ],
    host_permissions: [
      "*://*.edu/StudentRegistrationSsb/*",
      "*://*.edu/ssb/*",
      "*://prd-dars.temple.edu/selfservice/*",
      apiHostPermission(),
    ],
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
