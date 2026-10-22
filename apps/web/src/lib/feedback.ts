import * as Sentry from "@sentry/nextjs";

/** Where the form was opened, tagged on the feedback for triage in Sentry. */
export type FeedbackSource = "menu" | "error_page";

/**
 * Opens Sentry's feedback form. A submission carries the page URL and the
 * last minute of the (masked) session replay.
 */
export async function openFeedbackForm(source: FeedbackSource) {
  const feedback = Sentry.getFeedback();
  if (!feedback) return;
  // Each call builds a new form, so drop it once it's done either way.
  const form = await feedback.createForm({
    tags: { "feedback.source": source },
    onFormClose: () => form.removeFromDom(),
    onFormSubmitted: () => form.removeFromDom(),
  });
  form.appendToDom();
  form.open();
}
