/**
 * Sentry options shared by the browser, Node.js and edge runtimes. The
 * environment and release come from Vercel's system variables on deployments.
 */

/** Errors are always sent; only this share of traces is, to stay within quota. */
const DEPLOYED_TRACES_SAMPLE_RATE = 0.1;

/** Empty turns Sentry off, as in tests and local runs without a DSN. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const TRACES_SAMPLE_RATE =
  process.env.NODE_ENV === "development" ? 1 : DEPLOYED_TRACES_SAMPLE_RATE;
