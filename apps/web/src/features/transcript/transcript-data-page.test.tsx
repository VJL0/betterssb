import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { API, http, HttpResponse, server } from "@workspace/api-client/testing";
import type { TranscriptInspection } from "@workspace/api-client";
import { renderPage } from "@/test/render";
import { TranscriptDataPage } from "./transcript-data-page";

const RESULT: TranscriptInspection = {
  valid: true,
  data: {
    courses: [],
    gpa: 3.44,
    institution: "Temple University",
    program: {},
    periods: [],
    totals: [],
    diagnostics: [],
  },
  details: {
    courses: [],
    gpa: 3.44,
    institution: "Temple University",
    title: "Unofficial Academic Transcript",
    notices: [],
    student: [],
    periods: [],
    totals: [],
    metadata: { Creator: "Source metadata" },
    pages: [],
    lines: [],
    diagnostics: [],
  },
};

describe("TranscriptDataPage", () => {
  it("uploads a PDF and switches between simple and detailed JSON", async () => {
    server.use(
      http.post(`${API}/transcript/parse-pdf/data`, () =>
        HttpResponse.json(RESULT),
      ),
    );
    const user = userEvent.setup();
    const { store } = renderPage(<TranscriptDataPage />);
    await user.upload(
      screen.getByLabelText("Transcript PDF"),
      new File(["%PDF-"], "transcript.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "View JSON" }));
    expect(await screen.findByText("Transcript parsed.")).toBeTruthy();
    expect(screen.getByLabelText("Simple JSON").textContent).toContain(
      '"gpa": 3.44',
    );
    expect(screen.getByLabelText("Simple JSON").textContent).not.toContain(
      "Source metadata",
    );
    await user.click(screen.getByRole("button", { name: "Detailed JSON" }));
    expect(screen.getByLabelText("Detailed JSON").textContent).toContain(
      "Source metadata",
    );
    expect(await store.get("transcript")).toBeNull();
    await user.upload(
      screen.getByLabelText("Transcript PDF"),
      new File(["%PDF-new"], "replacement.pdf", { type: "application/pdf" }),
    );
    expect(screen.queryByLabelText("Detailed JSON")).toBeNull();
  });

  it("copies the JSON that's shown", async () => {
    server.use(
      http.post(`${API}/transcript/parse-pdf/data`, () =>
        HttpResponse.json(RESULT),
      ),
    );
    // user-event replaces the clipboard with one the test can read back.
    const user = userEvent.setup();
    renderPage(<TranscriptDataPage />);
    await user.upload(
      screen.getByLabelText("Transcript PDF"),
      new File(["%PDF-"], "transcript.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "View JSON" }));
    await user.click(await screen.findByRole("button", { name: "Copy JSON" }));
    expect(await navigator.clipboard.readText()).toBe(
      JSON.stringify(RESULT.data, null, 2),
    );
    await user.click(screen.getByRole("button", { name: "Detailed JSON" }));
    await user.click(screen.getByRole("button", { name: "Copy JSON" }));
    expect(await navigator.clipboard.readText()).toBe(
      JSON.stringify(RESULT.details, null, 2),
    );
  });

  it("shows a simple error when parsing fails", async () => {
    server.use(
      http.post(`${API}/transcript/parse-pdf/data`, () =>
        HttpResponse.json(
          { title: "Invalid transcript", detail: "Upload a valid PDF." },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage(<TranscriptDataPage />);
    await user.upload(
      screen.getByLabelText("Transcript PDF"),
      new File(["bad"], "bad.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "View JSON" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("Simple JSON")).toBeNull();
  });
});
