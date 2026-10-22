import { consoleLoggingIntegration } from "@sentry/nextjs";
import { ENVIRONMENT } from "@/lib/config";

/** Errors are always sent; only this share of traces is, to stay within quota. */
const TRACES_SAMPLE_RATE = 0.1;

/** Shared across browser, Node.js and edge; the SDK detects the release. */
export const SENTRY_OPTIONS = {
  // An empty string prevents the Node SDK from falling back to SENTRY_DSN.
  dsn:
    ENVIRONMENT === "production"
      ? process.env.NEXT_PUBLIC_SENTRY_DSN || ""
      : "",
  environment: ENVIRONMENT,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  integrations: [consoleLoggingIntegration({ levels: ["warn", "error"] })],
};

/** A build-time constant, so server and client render the same feedback UI. */
export const FEEDBACK_ENABLED = Boolean(SENTRY_OPTIONS.dsn);
