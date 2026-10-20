import { defineConfig } from "vitest/config";

export default defineConfig({
  // The `@/` alias comes from tsconfig.json, as it does for Next.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
