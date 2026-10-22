import * as Sentry from "@sentry/nextjs";
import { beforeEach, expect, it, vi } from "vitest";
import { openFeedbackForm } from "./feedback";

vi.mock("@sentry/nextjs", () => ({ getFeedback: vi.fn() }));

type FormOptions = {
  tags: Record<string, string>;
  onFormClose: () => void;
  onFormSubmitted: () => void;
};

function stubFeedback() {
  const form = {
    appendToDom: vi.fn(),
    open: vi.fn(),
    removeFromDom: vi.fn(),
  };
  const createForm = vi.fn<(options: FormOptions) => Promise<typeof form>>(
    async () => form,
  );
  vi.mocked(Sentry.getFeedback).mockReturnValue({
    createForm,
  } as unknown as ReturnType<typeof Sentry.getFeedback>);
  return { form, options: () => createForm.mock.calls[0][0] };
}

beforeEach(() => {
  vi.mocked(Sentry.getFeedback).mockReset();
});

it("does nothing when Sentry is off", async () => {
  vi.mocked(Sentry.getFeedback).mockReturnValue(undefined);
  await expect(openFeedbackForm("menu")).resolves.toBeUndefined();
});

it("opens a form tagged with where it was opened", async () => {
  const { form, options } = stubFeedback();

  await openFeedbackForm("error_page");

  expect(options().tags).toEqual({ "feedback.source": "error_page" });
  expect(form.appendToDom).toHaveBeenCalled();
  expect(form.open).toHaveBeenCalled();
});

it.each(["onFormClose", "onFormSubmitted"] as const)(
  "removes the form after %s, so reopening doesn't stack forms",
  async (callback) => {
    const { form, options } = stubFeedback();
    await openFeedbackForm("menu");

    options()[callback]();

    expect(form.removeFromDom).toHaveBeenCalledOnce();
  },
);
