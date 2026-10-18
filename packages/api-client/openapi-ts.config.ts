import { defineConfig } from "@hey-api/openapi-ts";

/**
 * Generates src/generated from the API's committed OpenAPI schema. Run
 * `pnpm api:generate` from the repo root after changing the API; CI fails if
 * the schema or this output is out of date.
 */
export default defineConfig({
  input: "../../apps/api/openapi.json",
  parser: {
    filters: {
      operations: {
        // Browser navigations for Google sign-in, not fetch calls.
        exclude: [
          "GET /api/auth/google/login",
          "GET /api/auth/google/callback",
        ],
      },
    },
  },
  output: {
    path: "src/generated",
    // The repo's Prettier config, so the output is the same on every machine.
    postProcess: ["prettier"],
  },
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    {
      name: "@hey-api/client-fetch",
      // Paths include /api. Each app sets its origin in configureApiClient.
      baseUrl: false,
      // Calls resolve with data or throw an ApiError (see src/errors.ts).
      throwOnError: true,
    },
    "@tanstack/react-query",
  ],
});
