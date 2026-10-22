import * as Sentry from "@sentry/nextjs";
import {
  CONSOLE_LOG_LEVELS,
  SENTRY_DSN,
  TRACES_SAMPLE_RATE,
} from "@/lib/sentry";

/** Session Replay records only sessions that hit an error or send feedback. */
const REPLAYS_ON_ERROR_SAMPLE_RATE = 1;
/** Profiles ride along with sampled traces, so this doesn't add page loads. */
const PROFILE_SESSION_SAMPLE_RATE = 1;

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  // Needs the Document-Policy: js-profiling header from next.config.ts.
  profileSessionSampleRate: PROFILE_SESSION_SAMPLE_RATE,
  profileLifecycle: "trace",
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: REPLAYS_ON_ERROR_SAMPLE_RATE,
  integrations: [
    // Replay masks all text and inputs by default, which keeps plans, audits
    // and transcripts out of recordings.
    Sentry.replayIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS }),
    // Opened from the account menu and the error page (lib/feedback.ts).
    Sentry.feedbackIntegration({
      autoInject: false,
      colorScheme: "light",
      showBranding: false,
      showName: false,
      // Screenshots aren't masked like Replay, so they could capture records.
      enableScreenshot: false,
      // The app's button colors; custom properties reach into the form's
      // shadow root. Not foreground/background: the form names its own
      // variables --foreground and --background, so var() there would point
      // at itself and leave the form transparent.
      themeLight: {
        accentForeground: "var(--primary-foreground)",
        accentBackground: "var(--primary)",
      },
      formTitle: "Send feedback",
      messageLabel: "Message",
      messagePlaceholder: "What happened, or what would help?",
      emailLabel: "Email, if you'd like a reply",
      submitButtonLabel: "Send",
      successMessageText: "Thanks, your feedback was sent.",
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
