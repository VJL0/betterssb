import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "BetterSSB",
    description: "Supercharge your university's Self-Service Banner registration",
    permissions: [
      "storage",
      "alarms",
      "notifications",
      "sidePanel",
      "identity",
      "tabs",
      "activeTab",
    ],
    host_permissions: [
      "*://*.edu/StudentRegistrationSsb/*",
      "*://*.edu/ssb/*",
    ],
  },
});
