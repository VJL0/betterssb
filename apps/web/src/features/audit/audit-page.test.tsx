import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCourse, emptyPlan } from "@workspace/shared/lib/plan";
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
import { AuditPage } from "./audit-page";

const NOW = "2026-10-17T12:00:00.000Z";

let bridge: ReturnType<typeof installFakeBridge> | null = null;

afterEach(() => {
  bridge?.uninstall();
  bridge = null;
  vi.unstubAllGlobals();
});

function auditFile() {
  return new File(["<html>audit</html>"], "audit.html", { type: "text/html" });
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

async function renderWithAudit() {
  const view = renderPage(<AuditPage />);
  await view.store.set("audit", { audit: sampleAudit(), storedAt: NOW });
  return view;
}

describe("AuditPage", () => {
  it("asks for an audit when none is saved", async () => {
    renderPage(<AuditPage />);
    expect(await screen.findByText("Add your degree audit")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload DARS file" }),
    ).toBeTruthy();
  });

  it("offers DARS first and the file as the other choice with the extension", async () => {
    bridge = installFakeBridge();
    renderPage(<AuditPage />);
    const dars = await screen.findByRole("button", { name: "Get from DARS" });
    const file = screen.getByRole("button", { name: "Upload DARS file" });
    expect(
      dars.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers both ways to update a saved audit", async () => {
    bridge = installFakeBridge();
    await renderWithAudit();
    expect(
      await screen.findByRole("button", { name: "Update from DARS" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload DARS file" }),
    ).toBeTruthy();
  });

  it("keeps the saved audit when DARS fails", async () => {
    bridge = installFakeBridge();
    const user = userEvent.setup();
    await renderWithAudit();
    await user.click(
      await screen.findByRole("button", { name: "Update from DARS" }),
    );
    expect(
      await screen.findByText("We couldn't get your degree audit"),
    ).toBeTruthy();
    expect(
      screen.getByText(/Your last saved degree audit is below\./),
    ).toBeTruthy();
  });

  it("asks to sign in to DARS when the extension finds the student signed out", async () => {
    bridge = installFakeBridge({ darsAudit: { status: "signed-out" } });
    const user = userEvent.setup();
    const { store } = renderPage(<AuditPage />);
    await user.click(
      await screen.findByRole("button", { name: "Get from DARS" }),
    );
    expect(await screen.findByText("Sign in to DARS")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open DARS" }).getAttribute("href"),
    ).toBe("https://prd-dars.temple.edu/selfservice/");
    expect(await store.get("audit")).toBeNull();
  });

  it("reads an uploaded audit file and saves it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    server.use(
      http.post(`${API}/dars/audits\\:parse`, () =>
        HttpResponse.json(sampleAudit()),
      ),
    );
    const { container, store } = renderPage(<AuditPage />);
    await screen.findByText("Add your degree audit");

    await user.upload(fileInput(container), auditFile());
    expect(
      await screen.findByRole("button", { name: /Computer Science major/ }),
    ).toBeTruthy();
    await waitFor(async () =>
      expect((await store.get("audit"))?.audit.programTitle).toBe(
        "Computer Science BS",
      ),
    );
  });

  it("shows credits, requirements and a link to find needed courses", async () => {
    await renderWithAudit();
    expect(await screen.findByText("Requirements met")).toBeTruthy();
    const credits = screen.getByText("Credits").parentElement!;
    expect(credits.textContent).toContain("52of 124 · 15 in progress");
    expect(
      screen
        .getByRole("link", { name: "Find sections of CIS 4397" })
        .getAttribute("href"),
    ).toBe("/search?q=CIS%204397");
  });

  it("labels transfer credit and advisor exceptions", async () => {
    const audit = sampleAudit();
    const [done] = audit.requirements[1]!.subrequirements;
    done!.courses = [
      { ...done!.courses[0]!, grade: "TR", transfer: true },
      {
        ...done!.courses[0]!,
        term: "",
        course: "MAJOR-1",
        grade: "CP",
        exception: true,
      },
    ];
    const view = renderPage(<AuditPage />);
    await view.store.set("audit", { audit, storedAt: NOW });

    expect(await screen.findByText("Transfer")).toBeTruthy();
    expect(screen.getByText("Advisor exception")).toBeTruthy();
    expect(screen.queryByText("MAJOR-1")).toBeNull();
  });

  it("filters to the lines still needed", async () => {
    const user = userEvent.setup();
    await renderWithAudit();
    await user.click(await screen.findByRole("tab", { name: /Needed/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Writing intensive")).toBeTruthy();
    expect(within(panel).queryByText("Software Design")).toBeNull();
  });

  it("notes needed courses that are already in a plan", async () => {
    const { store } = await renderWithAudit();
    await store.set(
      "plan:202736",
      addCourse(
        emptyPlan("202736", "Fall 2027"),
        {
          id: "x",
          code: "CIS 4398",
          title: "Projects in Computer Science",
          credits: 4,
          requirement: null,
          addedAt: NOW,
        },
        NOW,
      ),
    );
    expect(
      await screen.findByText("Your plan covers 1 more requirement"),
    ).toBeTruthy();
    expect(screen.getByText("Fall 2027 plan")).toBeTruthy();
  });

  it("keeps the saved audit when a new one can't be read", async () => {
    const user = userEvent.setup({ applyAccept: false });
    server.use(
      http.post(`${API}/dars/audits\\:parse`, () =>
        problemResponse(422, "This doesn't look like a DARS audit."),
      ),
    );
    const { container } = await renderWithAudit();
    await screen.findByText("Requirements met");
    await user.upload(fileInput(container), auditFile());
    expect(
      await screen.findByText("We couldn't get your degree audit"),
    ).toBeTruthy();
    expect(
      screen.getByText(/This doesn't look like a DARS audit\./),
    ).toBeTruthy();
    expect(screen.getByText("Requirements met")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = await renderWithAudit();
    await screen.findByText("Requirements met");
    expect(await axeViolations(container)).toEqual([]);
  });
});
