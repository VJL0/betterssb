import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { localDateTimeValue } from "@workspace/shared/lib/registration-time";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import { axeViolations } from "@workspace/ui/test/axe";
import { API, http, HttpResponse, server } from "@workspace/api-client/testing";
import { classSection } from "@workspace/shared/testing/class-section";
import { EMPTY_AUTO_REGISTER, installFakeBridge } from "@/test/fake-bridge";
import { renderPage } from "@/test/render";
import { RegisterPage } from "./register-page";

const NOW = "2026-10-17T12:00:00.000Z";
const FUTURE = "2030-11-14T07:00";
const SPRING = { code: "202703", description: "2027 Spring" };
const PORTAL_TIME = "2030-11-15T12:00:00.000Z";

let bridge: ReturnType<typeof installFakeBridge> | null = null;

beforeEach(() => {
  server.use(
    http.get(`${API}/classes/search`, () =>
      HttpResponse.json({
        totalCount: 1,
        fetchedAt: NOW,
        sections: [classSection()],
      }),
    ),
  );
});

afterEach(() => {
  bridge?.uninstall();
  bridge = null;
  vi.unstubAllGlobals();
});

function install(
  options: Omit<
    NonNullable<Parameters<typeof installFakeBridge>[0]>,
    "autoRegister"
  > & {
    autoRegister?: Partial<AutoRegSnapshot>;
  } = {},
) {
  bridge = installFakeBridge({
    registrationTerms: [SPRING],
    knownCrns: ["41207"],
    ...options,
    autoRegister: { ...EMPTY_AUTO_REGISTER, ...options.autoRegister },
  });
  return bridge;
}

async function renderWithPlan() {
  const view = renderPage(<RegisterPage />);
  await view.store.set(
    "plan:202703",
    addSection(
      emptyPlan("202703", "Spring 2027"),
      plannedSectionFrom(classSection(), NOW),
      NOW,
    ),
  );
  return view;
}

describe("RegisterPage", () => {
  it("explains that it runs from the extension", async () => {
    renderPage(<RegisterPage />);
    expect(
      await screen.findByText("Auto-register runs from the extension"),
    ).toBeTruthy();
  });

  it("queues the plan's sections and shows what they are", async () => {
    const user = userEvent.setup();
    const fake = install();
    await renderWithPlan();
    await user.click(
      await screen.findByRole("button", {
        name: "Add from your Spring 2027 plan",
      }),
    );
    await waitFor(() => expect(fake.auto.current.crns).toEqual(["41207"]));
    expect(fake.auto.current.term).toBe("202703");
    expect(await screen.findByText("CIS 2168 · 001")).toBeTruthy();
    expect(screen.getByText("TR 9:30–10:50 AM")).toBeTruthy();
  });

  it("checks a typed CRN before adding it", async () => {
    const user = userEvent.setup();
    const fake = install();
    renderPage(<RegisterPage />);
    const input = await screen.findByRole("textbox", { name: "Add CRN" });
    await user.type(input, "123{Enter}");
    expect(screen.getByText("A CRN is 5 digits, like 41207.")).toBeTruthy();
    await user.clear(input);
    await user.type(input, "52018{Enter}");
    await waitFor(() => expect(fake.auto.current.crns).toEqual(["52018"]));
    expect(await screen.findByText("Not in Banner")).toBeTruthy();
  });

  it("arms after the checks pass and confirming, then locks the queue", async () => {
    const user = userEvent.setup();
    const fake = install({
      autoRegister: { term: "202703", crns: ["41207"] },
    });
    renderPage(<RegisterPage />);
    const at = await screen.findByLabelText("Submit at");
    fireEvent.change(at, { target: { value: FUTURE } });
    await waitFor(() => expect(fake.auto.current.scheduledRunAt).toBe(FUTURE));
    expect(await screen.findByText("1 of 1 CRNs found in Banner")).toBeTruthy();
    expect(
      screen.getByText("Spring 2027 is open for registration"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Arm auto-register" }));
    await user.click(await screen.findByRole("button", { name: "Arm" }));
    await waitFor(() => expect(fake.auto.current.armed).toBe(true));
    expect(
      await screen.findByText(
        "The queue is locked while armed. Disarm to edit.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Add CRN" })).toBeNull();
  });

  it("won't arm without a Banner tab", async () => {
    install({
      banner: "not-connected",
      autoRegister: { term: "202703", crns: ["41207"], scheduledRunAt: FUTURE },
    });
    renderPage(<RegisterPage />);
    expect(
      await screen.findByText("Can't arm: no Banner tab is open"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Arm auto-register" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fills an empty submit time from TUportal", async () => {
    const fake = install({
      autoRegister: { term: "202703", crns: ["41207"] },
      registrationTime: { status: "found", startsAt: PORTAL_TIME },
    });
    renderPage(<RegisterPage />);
    await waitFor(() =>
      expect(fake.auto.current.scheduledRunAt).toBe(
        localDateTimeValue(PORTAL_TIME),
      ),
    );
    expect(
      await screen.findByText(
        "Your registration time from TUportal, in this computer's time zone.",
      ),
    ).toBeTruthy();
  });

  it("keeps a time the student set and offers TUportal's", async () => {
    const user = userEvent.setup();
    const fake = install({
      autoRegister: { term: "202703", crns: ["41207"], scheduledRunAt: FUTURE },
      registrationTime: { status: "found", startsAt: PORTAL_TIME },
    });
    renderPage(<RegisterPage />);
    await user.click(
      await screen.findByRole("button", { name: "Use this time" }),
    );
    await waitFor(() =>
      expect(fake.auto.current.scheduledRunAt).toBe(
        localDateTimeValue(PORTAL_TIME),
      ),
    );
  });

  it("doesn't fill in a TUportal time that has passed", async () => {
    const fake = install({
      autoRegister: { term: "202703", crns: ["41207"] },
      registrationTime: { status: "found", startsAt: "2020-11-15T12:00:00Z" },
    });
    renderPage(<RegisterPage />);
    expect(
      await screen.findByText(/TUportal says your window opens/),
    ).toBeTruthy();
    expect(fake.auto.current.scheduledRunAt).toBe("");
  });

  it("asks to sign in to TUportal when it's signed out", async () => {
    install({
      autoRegister: { term: "202703", crns: ["41207"] },
      registrationTime: { status: "signed-out" },
    });
    renderPage(<RegisterPage />);
    expect(
      await screen.findByRole("link", { name: "Sign in to TUportal" }),
    ).toBeTruthy();
  });

  it("shows the last run by CRN", async () => {
    install({
      autoRegister: {
        term: "202703",
        crns: ["41207"],
        lastResult: {
          at: NOW,
          ok: false,
          registeredCount: 1,
          failedCount: 1,
          stagingFailures: [],
          crnResults: [
            { crn: "41207", label: "CIS 2168", ok: true, detail: "Registered" },
            {
              crn: "52018",
              label: "MATH 2101",
              ok: false,
              detail: "Closed section",
            },
          ],
          registeredHours: "4",
          billingHours: "4",
          summary: "1 registered, 1 failed",
        },
      },
    });
    renderPage(<RegisterPage />);
    expect(
      await screen.findByText("Last run · 1 of 2 registered"),
    ).toBeTruthy();
    expect(screen.getByText("Closed section")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    install({
      autoRegister: { term: "202703", crns: ["41207"], scheduledRunAt: FUTURE },
    });
    const { container } = await renderWithPlan();
    await screen.findByText("CIS 2168 · 001");
    expect(await axeViolations(container)).toEqual([]);
  });
});
