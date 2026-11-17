import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AcademicTranscript } from "@workspace/api-client";
import type { TranscriptData } from "@workspace/shared/lib/transcript";
import { axeViolations } from "@workspace/ui/test/axe";
import {
  API,
  http,
  HttpResponse,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import { sampleAudit } from "@workspace/shared/testing/audit";
import { renderPage } from "@/test/render";
import { TranscriptPage } from "./transcript-page";
import { TRANSCRIPT_PDF_URL } from "./transcript-pdf";

const NOW = "2026-10-17T12:00:00.000Z";

const TRANSCRIPT: TranscriptData = {
  gpa: 3.42,
  courses: [
    {
      subject: "CIS",
      courseNumber: "1051",
      title: "Intro to Problem Solving",
      grade: "A",
      credits: 4,
      term: "Spring 2026",
      category: "institution",
      repeat: null,
    },
    {
      subject: "ENG",
      courseNumber: "0802",
      title: "Analytical Reading and Writing",
      grade: "A",
      credits: 4,
      term: "Fall 2025",
      category: "institution",
      repeat: null,
    },
  ],
};

const PARSED: AcademicTranscript = {
  gpa: 3.42,
  institution: "Temple University",
  program: {},
  periods: [],
  totals: [],
  diagnostics: [],
  courses: [
    {
      ...TRANSCRIPT.courses[0]!,
      term: "2026 Spring",
      category: "institution",
      qualityPoints: 16,
      repeat: null,
    },
    {
      ...TRANSCRIPT.courses[1]!,
      term: "2025 Fall",
      category: "institution",
      qualityPoints: 16,
      repeat: null,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function upload(file = new File(["%PDF-"], "transcript.pdf")) {
  const user = userEvent.setup();
  await user.upload(await screen.findByLabelText("Transcript PDF"), file);
  await user.click(screen.getByRole("button", { name: "Read transcript" }));
}

describe("TranscriptPage", () => {
  it("links to the transcript PDF", async () => {
    renderPage(<TranscriptPage />);
    const link = await screen.findByRole("link", {
      name: "your transcript PDF",
    });
    expect(link.getAttribute("href")).toBe(TRANSCRIPT_PDF_URL);
  });

  it("copies the transcript link", async () => {
    // user-event replaces the clipboard with one the test can read back.
    const user = userEvent.setup();
    renderPage(<TranscriptPage />);
    await user.click(
      await screen.findByRole("button", { name: "Copy transcript link" }),
    );
    expect(await navigator.clipboard.readText()).toBe(TRANSCRIPT_PDF_URL);
  });

  it("reads an uploaded PDF into terms and saves only the courses", async () => {
    server.use(
      http.post(`${API}/transcript/parse-pdf`, () => HttpResponse.json(PARSED)),
    );
    const { store } = renderPage(<TranscriptPage />);
    await upload();

    const spring = await screen.findByRole("article", { name: "Spring 2026" });
    expect(within(spring).getAllByText("CIS 1051").length).toBeGreaterThan(0);
    expect(screen.getByText("2 courses · 2 terms · GPA 3.42")).toBeTruthy();
    await waitFor(async () =>
      expect((await store.get("transcript"))?.transcript).toEqual(TRANSCRIPT),
    );
  });

  it("shows why a PDF couldn't be read, and saves nothing", async () => {
    server.use(
      http.post(`${API}/transcript/parse-pdf`, () =>
        problemResponse(422, "Upload a valid PDF."),
      ),
    );
    const { store } = renderPage(<TranscriptPage />);
    await upload();
    expect(await screen.findByText("Upload a valid PDF.")).toBeTruthy();
    expect(await store.get("transcript")).toBeNull();
  });

  it("rejects a PDF over the size limit without uploading it", async () => {
    const big = new File(["%PDF-"], "big.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    renderPage(<TranscriptPage />);
    await upload(big);
    expect(
      await screen.findByText("Choose a PDF smaller than 10 MiB."),
    ).toBeTruthy();
  });

  it("shows what each course counts toward from the saved audit", async () => {
    const { store } = renderPage(<TranscriptPage />);
    await store.set("audit", { audit: sampleAudit(), storedAt: NOW });
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    const row = await screen.findByRole("row", { name: /CIS 1051/ });
    // Course, title, counts toward, credits, grade.
    expect(within(row).getAllByRole("cell")[2]!.textContent).toBe(
      "Intro to Problem Solving",
    );
    const eng = screen.getByRole("row", { name: /ENG 0802/ });
    expect(within(eng).getAllByRole("cell")[2]!.textContent).toBe("—");
  });

  describe("what-if grades", () => {
    const WITH_COURSE_IN_PROGRESS: TranscriptData = {
      gpa: 3.5,
      courses: [
        { ...TRANSCRIPT.courses[0]!, grade: "A" },
        { ...TRANSCRIPT.courses[1]!, grade: "B" },
        {
          subject: "CIS",
          courseNumber: "2168",
          title: "Data Structures",
          grade: "",
          credits: 4,
          term: "Fall 2026",
          category: "in_progress",
          repeat: null,
        },
      ],
    };

    async function tryGrades() {
      const user = userEvent.setup();
      const view = renderPage(<TranscriptPage />);
      await view.store.set("transcript", {
        transcript: WITH_COURSE_IN_PROGRESS,
        storedAt: NOW,
      });
      await user.click(
        await screen.findByRole("button", { name: "Try other grades" }),
      );
      return { user, ...view };
    }

    async function pick(
      user: ReturnType<typeof userEvent.setup>,
      picker: string,
      grade: string,
    ) {
      await user.click(screen.getAllByRole("combobox", { name: picker })[0]!);
      await user.click(await screen.findByRole("option", { name: grade }));
    }

    it("tries a grade without saving it", async () => {
      const { user, store } = await tryGrades();
      expect(screen.getByText("from 3.50 now")).toBeTruthy();

      await pick(user, "Grade for ENG 0802", "A");
      expect(screen.getByText("4.00")).toBeTruthy();
      expect(screen.getAllByText("was B").length).toBeGreaterThan(0);
      expect((await store.get("transcript"))?.transcript).toEqual(
        WITH_COURSE_IN_PROGRESS,
      );

      await user.click(screen.getByRole("button", { name: "Done" }));
      expect(screen.getByText("3.50")).toBeTruthy();
      expect(screen.queryByText("was B")).toBeNull();
    });

    it("counts an expected grade on a course in progress", async () => {
      const { user } = await tryGrades();
      await pick(user, "Expected grade for CIS 2168", "B");
      // (16 + 12 + 12) / 12
      expect(screen.getByText("3.33")).toBeTruthy();
    });

    it("says what the open credits need for a target", async () => {
      const { user } = await tryGrades();
      const target = screen.getByLabelText("Target GPA");

      await user.type(target, "3.6");
      expect(
        screen.getByText(
          "You need about an A average (4.00) across your 4 open credits.",
        ),
      ).toBeTruthy();

      await user.clear(target);
      await user.type(target, "3.75");
      expect(
        screen.getByText(
          "Out of reach: straight A's across your 4 open credits give 3.67.",
        ),
      ).toBeTruthy();
    });

    it("has no accessibility violations while trying grades", async () => {
      const { container } = await tryGrades();
      expect(await axeViolations(container)).toEqual([]);
    });
  });

  it("has no accessibility violations", async () => {
    const { container, store } = renderPage(<TranscriptPage />);
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    await screen.findByRole("article", { name: "Spring 2026" });
    expect(await axeViolations(container)).toEqual([]);
  });
});
