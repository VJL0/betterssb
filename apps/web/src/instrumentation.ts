import * as Sentry from "@sentry/nextjs";
import { SENTRY_OPTIONS } from "@/lib/sentry";

// `@sentry/nextjs` resolves to its Node.js or edge build for each runtime.
export function register(): void {
  Sentry.init(SENTRY_OPTIONS);
}

export const onRequestError = Sentry.captureRequestError;
