import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { SeatWatchCreate, SeatWatchResponse } from "@workspace/api-client";
import {
  API,
  FETCHED_AT,
  HttpResponse,
  http,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import { AppHeader } from "@/components/shell/app-header";
import { renderPage } from "@/test/render";

const WATCH: SeatWatchResponse = {
  id: "watch-1",
  term: "202703",
  crn: "50067",
  title: "Software Security",
  subject: "Computer & Information Science",
  courseNumber: "3441",
  section: "702",
  seatsAvailable: 0,
  maximumEnrollment: 30,
  waitCount: 15,
  waitCapacity: 100,
  waitAvailable: 85,
  checkedAt: FETCHED_AT,
  notifiedAt: null,
  createdAt: FETCHED_AT,
};

/** A fake API holding the student's watches. */
function watching(initial: SeatWatchResponse[]) {
  let watches = [...initial];
  const created: SeatWatchCreate[] = [];
  server.use(
    http.get(`${API}/seat-watches`, () => HttpResponse.json(watches)),
    http.post<never, SeatWatchCreate>(
      `${API}/seat-watches`,
      async ({ request }) => {
        const body = await request.json();
        created.push(body);
        const watch = { ...WATCH, id: `watch-${body.crn}`, crn: body.crn };
        watches = [...watches, watch];
        return HttpResponse.json(watch, { status: 201 });
      },
    ),
    http.delete(`${API}/seat-watches/:id`, ({ params }) => {
      watches = watches.filter((w) => w.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { created };
}

async function openTracker() {
  const user = userEvent.setup();
  renderPage(<AppHeader />);
  await user.click(
    await screen.findByRole("button", { name: /^Seat tracker/ }),
  );
  return { user, popover: await screen.findByRole("dialog") };
}

describe("SeatTrackerMenu", () => {
  it("isn't there for guests", async () => {
    server.use(http.get(`${API}/auth/me`, () => problemResponse(401)));
    renderPage(<AppHeader />);
    await screen.findByRole("link", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: /^Seat tracker/ })).toBeNull();
  });

  it("shows the classes it's waiting on and where it emails", async () => {
    watching([WATCH]);
    const { popover } = await openTracker();

    expect(within(popover).getByText("student@temple.edu")).toBeTruthy();
    expect(within(popover).getByText("Waiting on 1 class")).toBeTruthy();
    expect(within(popover).getByText("Software Security")).toBeTruthy();
    expect(
      within(popover).getByText(
        "Computer & Information Science 3441-702 · CRN 50067",
      ),
    ).toBeTruthy();
    expect(within(popover).getByText("Full · waitlist 15/100")).toBeTruthy();
  });

  it("watches a CRN in the current term", async () => {
    const api = watching([]);
    const { user, popover } = await openTracker();
    expect(within(popover).getByText(/Not watching anything yet/)).toBeTruthy();

    await user.type(
      await within(popover).findByLabelText("CRN for Spring 2027"),
      "41207",
    );
    await user.click(within(popover).getByRole("button", { name: "Watch" }));

    expect(
      await within(popover).findByText("CRN 41207", { exact: false }),
    ).toBeTruthy();
    expect(api.created).toEqual([{ term: "202703", crn: "41207" }]);
  });

  it("checks the CRN before asking the API", async () => {
    const api = watching([WATCH]);
    const { user, popover } = await openTracker();
    const input = await within(popover).findByLabelText("CRN for Spring 2027");

    await user.type(input, "123");
    await user.click(within(popover).getByRole("button", { name: "Watch" }));
    expect(
      within(popover).getByText("A CRN is 5 digits, like 41207."),
    ).toBeTruthy();

    await user.clear(input);
    await user.type(input, "50067");
    await user.click(within(popover).getByRole("button", { name: "Watch" }));
    expect(
      within(popover).getByText("You're already watching 50067."),
    ).toBeTruthy();
    expect(api.created).toEqual([]);
  });

  it("shows why the API turned a CRN down", async () => {
    watching([]);
    server.use(
      http.post(`${API}/seat-watches`, () =>
        problemResponse(404, "There's no CRN 99999 in this term."),
      ),
    );
    const { user, popover } = await openTracker();

    await user.type(
      await within(popover).findByLabelText("CRN for Spring 2027"),
      "99999",
    );
    await user.click(within(popover).getByRole("button", { name: "Watch" }));

    expect(
      await within(popover).findByText("There's no CRN 99999 in this term."),
    ).toBeTruthy();
  });

  it("stops watching a section", async () => {
    watching([WATCH]);
    const { user, popover } = await openTracker();

    await user.click(
      within(popover).getByRole("button", { name: "Stop watching CRN 50067" }),
    );

    await waitFor(() =>
      expect(
        within(popover).getByText(/Not watching anything yet/),
      ).toBeTruthy(),
    );
  });

  it("says when it emailed about an opening", async () => {
    watching([{ ...WATCH, seatsAvailable: 2, notifiedAt: FETCHED_AT }]);
    const { popover } = await openTracker();
    expect(within(popover).getByText(/^Emailed you at/)).toBeTruthy();
    expect(within(popover).getByText("2 left")).toBeTruthy();
  });
});
