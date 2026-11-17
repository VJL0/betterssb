import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([".output", ".wxt"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      pluginQuery.configs["flat/recommended"],
    ],
  },
]);
