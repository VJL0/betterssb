import * as Sentry from "@sentry/nextjs";
import {
  CONSOLE_LOG_LEVELS,
  SENTRY_DSN,
  TRACES_SAMPLE_RATE,
} from "@/lib/sentry";

// `@sentry/nextjs` resolves to its Node.js or edge build for each runtime.
export function register() {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS }),
    ],
  });
}

export const onRequestError = Sentry.captureRequestError;
