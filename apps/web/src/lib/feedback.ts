import * as Sentry from "@sentry/nextjs";

/**
 * Opens Sentry's feedback form. A submission carries the page URL and the
 * last minute of the (masked) session replay.
 */
export async function openFeedbackForm() {
  const feedback = Sentry.getFeedback();
  if (!feedback) return;
  const form = await feedback.createForm({
    onFormClose: () => form.removeFromDom(),
  });
  form.appendToDom();
  form.open();
}
