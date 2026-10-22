/**
 * Sentry options shared by the browser, Node.js and edge runtimes. The
 * environment and release come from Vercel's system variables on deployments.
 */

/** Vercel's production and preview deployments; unset or "development" locally. */
const DEPLOYED = ["production", "preview"].includes(
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? "",
);

/**
 * Only deployments report, so local runs never send to Sentry, even with a
 * DSN set. Without a DSN the SDK stays off.
 */
export const SENTRY_DSN = DEPLOYED
  ? process.env.NEXT_PUBLIC_SENTRY_DSN
  : undefined;

/** A build-time constant, so server and client render the same feedback UI. */
export const FEEDBACK_ENABLED = Boolean(SENTRY_DSN);

/** Errors are always sent; only this share of traces is, to stay within quota. */
export const TRACES_SAMPLE_RATE = 0.1;

/** Console warnings and errors become Sentry Logs; routine output stays local. */
export const CONSOLE_LOG_LEVELS: ("warn" | "error")[] = ["warn", "error"];
