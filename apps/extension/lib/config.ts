/**
 * Build-time configuration, baked in from `.env` files (see `.env.example`).
 * Use `.env.development` / `.env.production` for per-mode values.
 */
export const API_URL: string = (
  import.meta.env.WXT_API_URL || "http://localhost:8000/api"
).replace(/\/+$/, "");
