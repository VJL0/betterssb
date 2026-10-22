import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, TRACES_SAMPLE_RATE } from "@/lib/sentry";

/** Session Replay records only sessions that hit an error. */
const REPLAYS_ON_ERROR_SAMPLE_RATE = 1;

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: REPLAYS_ON_ERROR_SAMPLE_RATE,
  // Replay masks all text and inputs by default, which keeps plans, audits
  // and transcripts out of recordings.
  integrations: [Sentry.replayIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
