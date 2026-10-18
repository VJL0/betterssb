import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// WxtVitest gives tests WXT's aliases and an in-memory `browser` (fakeBrowser).
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
