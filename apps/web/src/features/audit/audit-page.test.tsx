import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addCourse, emptyPlan } from "@workspace/shared/lib/plan";
import { axeViolations } from "@workspace/ui/test/axe";
import { mockApi, problemResponse } from "@/test/api";
import { sampleAudit } from "@/test/audit";
import { renderPage } from "@/test/render";
import { AuditPage } from "./audit-page";

const NOW = "2026-10-17T12:00:00.000Z";

afterEach(() => {
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
    expect(await screen.findByText("See your degree audit")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Upload DARS file" }),
    ).toBeTruthy();
  });

  it("reads an uploaded audit file and saves it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const parse = vi.fn(() => Response.json(sampleAudit()));
    mockApi({ "POST /api/dars/audits/parse": parse });
    const { container, store } = renderPage(<AuditPage />);
    await screen.findByText("See your degree audit");

    await user.upload(fileInput(container), auditFile());
    expect(
      await screen.findByRole("button", { name: /Computer Science major/ }),
    ).toBeTruthy();
    expect(parse).toHaveBeenCalledOnce();
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
    mockApi({
      "POST /api/dars/audits/parse": () =>
        problemResponse(422, "This doesn't look like a DARS audit."),
    });
    const { container } = await renderWithAudit();
    await screen.findByText("Requirements met");
    await user.upload(fileInput(container), auditFile());
    expect(await screen.findByText("The audit didn't update")).toBeTruthy();
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
