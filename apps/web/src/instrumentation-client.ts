import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry";

/** Session Replay records only sessions that hit an error or send feedback. */
const REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
/** Profiles ride along with sampled traces, so this doesn't add page loads. */
const PROFILE_SESSION_SAMPLE_RATE = 1;

Sentry.init({
  ...SENTRY_OPTIONS,
  // Needs the Document-Policy: js-profiling header from next.config.ts.
  profileSessionSampleRate: PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: "trace",
  replaysOnErrorSampleRate: REPLAYS_ON_ERROR_SAMPLE_RATE,
  integrations: [
    // Replay masks all text and inputs by default, which keeps plans, audits
    // and transcripts out of recordings.
    Sentry.replayIntegration(),
    Sentry.browserProfilingIntegration(),
    ...SENTRY_OPTIONS.integrations,
    // Opened from the account menu and the error page (lib/feedback.ts).
    Sentry.feedbackIntegration({
      autoInject: false,
      showName: false,
      formTitle: "Send feedback",
      messageLabel: "Feedback",
      messagePlaceholder:
        "Share an idea, suggest an improvement, or let us know about a problem.",
      submitButtonLabel: "Send feedback",
      successMessageText: "Thanks for helping us improve BetterSSB.",
      // Screenshots aren't masked like Replay, so they could capture records.
      enableScreenshot: false,
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
