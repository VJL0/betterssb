/**
 * Build-time configuration, baked in from `.env` files (see `.env.example`).
 * Use `.env.development` / `.env.production` for per-mode values.
 */

/** The backend's origin. Generated API paths already start with /api. */
export const API_ORIGIN: string = (
  import.meta.env.WXT_API_ORIGIN || "http://localhost:8000"
).replace(/\/+$/, "");
