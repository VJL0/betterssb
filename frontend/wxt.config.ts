import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
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
    host_permissions: ["*://*.edu/StudentRegistrationSsb/*", "*://*.edu/ssb/*"],
  },
  webExt: {
    disabled: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
