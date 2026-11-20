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
import { installFakeBridge } from "@/test/fake-bridge";
import { renderPage } from "@/test/render";
import { TranscriptPage } from "./transcript-page";
import { TRANSCRIPT_PAGE_URL, TRANSCRIPT_PDF_URL } from "./transcript-pdf";

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

let bridge: ReturnType<typeof installFakeBridge> | null = null;

afterEach(() => {
  bridge?.uninstall();
  bridge = null;
  vi.unstubAllGlobals();
});

/** Picks a PDF the way "Upload transcript PDF" does, through the page's hidden file input. */
async function upload(file = new File(["%PDF-"], "transcript.pdf")) {
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Upload transcript PDF" });
  await user.upload(
    document.querySelector<HTMLInputElement>('input[type="file"]')!,
    file,
  );
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

  it("gets the transcript from Banner through the extension", async () => {
    bridge = installFakeBridge({
      transcript: { status: "found", transcript: TRANSCRIPT },
    });
    const user = userEvent.setup();
    const { store } = renderPage(<TranscriptPage />);
    await user.click(
      await screen.findByRole("button", { name: "Get from Banner" }),
    );

    expect(
      await screen.findByRole("article", { name: "Spring 2026" }),
    ).toBeTruthy();
    await waitFor(async () =>
      expect((await store.get("transcript"))?.transcript).toEqual(TRANSCRIPT),
    );
    expect(
      screen.getByRole("button", { name: "Update from Banner" }),
    ).toBeTruthy();
  });

  it("asks to sign in to Self-Service when Banner says the student is signed out", async () => {
    bridge = installFakeBridge({ transcript: { status: "signed-out" } });
    const user = userEvent.setup();
    const { store } = renderPage(<TranscriptPage />);
    await user.click(
      await screen.findByRole("button", { name: "Get from Banner" }),
    );

    const link = await screen.findByRole("link", {
      name: "Open Banner Self-Service",
    });
    expect(link.getAttribute("href")).toBe(TRANSCRIPT_PAGE_URL);
    expect(screen.getByText("Sign in to Banner Self-Service")).toBeTruthy();
    expect(await store.get("transcript")).toBeNull();
  });

  it("offers Banner first and the PDF as the other choice with the extension", async () => {
    bridge = installFakeBridge();
    renderPage(<TranscriptPage />);
    await screen.findByRole("button", { name: "Get from Banner" });
    const [banner, pdf] = ["Get from Banner", "Upload transcript PDF"].map(
      (name) => screen.getByRole("button", { name }),
    );
    expect(
      banner!.compareDocumentPosition(pdf!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers both ways to update a saved transcript", async () => {
    bridge = installFakeBridge();
    const { store } = renderPage(<TranscriptPage />);
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    expect(
      await screen.findByRole("button", { name: "Update from Banner" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload transcript PDF" }),
    ).toBeTruthy();
  });

  it("offers only the PDF without the extension", async () => {
    renderPage(<TranscriptPage />);
    expect(await screen.findByText("Add your transcript")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload transcript PDF" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Get from Banner" }),
    ).toBeNull();
  });

  it("reads an uploaded PDF into terms and saves only the courses", async () => {
    server.use(
      http.post(`${API}/transcripts\\:parse`, () => HttpResponse.json(PARSED)),
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
      http.post(`${API}/transcripts\\:parse`, () =>
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
        {
          subject: "MATH",
          courseNumber: "1041",
          title: "Calculus I",
          grade: "TR",
          credits: 4,
          term: "Spring 2024",
          category: "transfer",
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
      await screen.findByRole("article", { name: "Spring 2026" });
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

    it("changes a grade right on the transcript without saving it", async () => {
      const { user, store } = await tryGrades();
      expect(
        screen.getByText("Change any grade to see how it moves your GPA."),
      ).toBeTruthy();

      await pick(user, "Grade for ENG 0802", "A");
      expect(screen.getByRole("heading", { name: "What-if GPA" })).toBeTruthy();
      expect(screen.getByText("4.00")).toBeTruthy();
      expect(screen.getByText("actual 3.50")).toBeTruthy();
      expect(screen.getByText("1 what-if grade, not saved.")).toBeTruthy();
      expect((await store.get("transcript"))?.transcript).toEqual(
        WITH_COURSE_IN_PROGRESS,
      );

      await user.click(
        screen.getByRole("button", { name: "Revert to actual grades" }),
      );
      expect(screen.getByRole("heading", { name: "GPA" })).toBeTruthy();
      expect(screen.getByText("3.50")).toBeTruthy();
    });

    it("reverts one changed grade on its own", async () => {
      const { user } = await tryGrades();
      await pick(user, "Grade for ENG 0802", "A");
      await pick(user, "Grade for CIS 1051", "B");
      expect(screen.getByText("2 what-if grades, not saved.")).toBeTruthy();

      await user.click(
        screen.getAllByRole("button", { name: "Revert ENG 0802 to B" })[0]!,
      );
      expect(screen.getByText("1 what-if grade, not saved.")).toBeTruthy();
      expect(
        screen.queryAllByRole("button", { name: "Revert ENG 0802 to B" }),
      ).toEqual([]);
    });

    it("tries a grade on any course, transfer credit too, and puts it back", async () => {
      const { user } = await tryGrades();
      await user.click(
        screen.getByRole("button", { name: "Show 1 earlier term" }),
      );
      await pick(user, "Grade for MATH 1041", "A");
      // (16 + 12 + 16) / 12
      expect(screen.getByText("3.67")).toBeTruthy();
      expect(
        screen.getAllByRole("button", { name: "Revert MATH 1041 to TR" })
          .length,
      ).toBeGreaterThan(0);

      await pick(user, "Grade for MATH 1041", "TR");
      expect(screen.getByText("3.50")).toBeTruthy();
      expect(
        screen.queryAllByRole("button", { name: "Revert MATH 1041 to TR" }),
      ).toEqual([]);
    });

    it("counts an expected grade on a course in progress", async () => {
      const { user } = await tryGrades();
      await pick(user, "Expected grade for CIS 2168", "B");
      // (16 + 12 + 12) / 12
      expect(screen.getByText("3.33")).toBeTruthy();
    });

    it("says what the courses in progress need for a target", async () => {
      const { user } = await tryGrades();
      const target = screen.getByLabelText("Target GPA");

      await user.type(target, "3.6");
      expect(
        screen.getByText(
          "You need about an A average (4.00) in the 4 credits you haven't set a grade for.",
        ),
      ).toBeTruthy();

      await user.clear(target);
      await user.type(target, "3.75");
      expect(
        screen.getByText(
          "Out of reach: straight A's in the 4 credits you haven't set a grade for give 3.67.",
        ),
      ).toBeTruthy();
    });

    it("has no accessibility violations while trying grades", async () => {
      const { container } = await tryGrades();
      expect(await axeViolations(container)).toEqual([]);
    });
  });

  it("links to the audit until one is saved", async () => {
    const { store } = renderPage(<TranscriptPage />);
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    expect(
      (
        await screen.findByRole("link", { name: "Open degree audit" })
      ).getAttribute("href"),
    ).toBe("/records/audit");
  });

  it("has no accessibility violations", async () => {
    const { container, store } = renderPage(<TranscriptPage />);
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    await screen.findByRole("article", { name: "Spring 2026" });
    expect(await axeViolations(container)).toEqual([]);
  });
});
