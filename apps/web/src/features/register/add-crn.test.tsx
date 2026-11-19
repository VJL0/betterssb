import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { API, http, HttpResponse, server } from "@workspace/api-client/testing";
import { renderPage } from "@/test/render";
import { AddCrn } from "./add-crn";

const DATA_STRUCTURES = {
  crn: "41207",
  title: "Data Structures",
  subject: "CIS",
  courseNumber: "2168",
  section: "001",
};
const NOT_FOUND_MESSAGE =
  "No Spring 2027 section has CRN 52018. Check the number, or choose the term it's in.";
const FORMAT_MESSAGE = "A CRN is 4 or 5 digits, like 41207.";

/** CRNs asked about, in order. */
let lookups: string[] = [];

function answerLookups() {
  lookups = [];
  server.use(
    http.get(`${API}/classes/terms/:term/sections/:crn`, ({ params }) => {
      lookups.push(String(params.crn));
      return params.crn === DATA_STRUCTURES.crn
        ? HttpResponse.json(DATA_STRUCTURES)
        : HttpResponse.json(
            { detail: "There's no such CRN." },
            { status: 404 },
          );
    }),
  );
}

function Harness({ initial = [] }: { initial?: string[] }) {
  const [crns, setCrns] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <AddCrn
        inputRef={inputRef}
        crns={crns}
        term="202703"
        termName="Spring 2027"
        onAdd={(crn) => setCrns([...crns, crn])}
      />
      <ul aria-label="Queued">
        {crns.map((crn) => (
          <li key={crn}>{crn}</li>
        ))}
      </ul>
    </>
  );
}

function setUp(initial?: string[]) {
  const user = userEvent.setup();
  renderPage(<Harness initial={initial} />);
  const input = screen.getByRole("textbox", { name: "Add CRN" });
  return { user, input };
}

function queued() {
  return screen.queryAllByRole("listitem").map((item) => item.textContent);
}

beforeEach(answerLookups);

describe("AddCrn", () => {
  it("adds a CRN Banner finds, clears the field and says so", async () => {
    const { user, input } = setUp();
    await user.type(input, "41207{Enter}");

    await waitFor(() => expect(queued()).toEqual(["41207"]));
    expect(input).toHaveProperty("value", "");
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("status").textContent).toBe("Added CRN 41207.");
  });

  it("keeps a CRN Banner has no section for out, with the reason", async () => {
    const { user, input } = setUp();
    await user.type(input, "52018{Enter}");

    const error = await screen.findByText(NOT_FOUND_MESSAGE);
    expect(queued()).toEqual([]);
    expect(input).toHaveProperty("value", "52018");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
  });

  it("says a CRN isn't found again on each Add, asking Banner once", async () => {
    const { user, input } = setUp();
    await user.type(input, "52018{Enter}");
    const first = await screen.findByText(NOT_FOUND_MESSAGE);

    await user.type(input, "{Enter}");

    // A new alert, so screen readers announce it again.
    await waitFor(() =>
      expect(screen.getByText(NOT_FOUND_MESSAGE)).not.toBe(first),
    );
    expect(lookups).toEqual(["52018"]);
  });

  it("clears a not-found error at the first edit and waits for Add", async () => {
    const { user, input } = setUp();
    await user.type(input, "52018{Enter}");
    await screen.findByText(NOT_FOUND_MESSAGE);

    await user.type(input, "{Backspace}");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();

    await user.type(input, "{Backspace}{Backspace}{Backspace}");
    expect(screen.queryByRole("alert")).toBeNull();

    await user.type(input, "{Enter}");
    expect(screen.getByRole("alert").textContent).toBe(FORMAT_MESSAGE);
  });

  it("keeps a format error while it's true and clears it once it isn't", async () => {
    const { user, input } = setUp();
    await user.type(input, "123{Enter}");
    expect(screen.getByRole("alert").textContent).toBe(FORMAT_MESSAGE);

    await user.type(input, "{Backspace}");
    expect(screen.getByRole("alert").textContent).toBe(FORMAT_MESSAGE);

    await user.type(input, "34");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears an error when the field is emptied", async () => {
    const { user, input } = setUp();
    await user.type(input, "123{Enter}");
    await user.clear(input);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("updates an already-added error as the number changes", async () => {
    const { user, input } = setUp(["41207"]);
    await user.type(input, "41207{Enter}");
    expect(screen.getByRole("alert").textContent).toBe(
      "41207 is already added.",
    );

    await user.type(input, "{Backspace}8");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores Banner's answer for a CRN edited while it was checked", async () => {
    let answer: () => void = () => undefined;
    server.use(
      http.get(
        `${API}/classes/terms/:term/sections/:crn`,
        () =>
          new Promise<Response>((resolve) => {
            answer = () => resolve(HttpResponse.json(DATA_STRUCTURES));
          }),
      ),
    );
    const { user, input } = setUp();
    await user.type(input, "41207{Enter}");
    expect(
      await screen.findByRole("button", { name: "Checking…" }),
    ).toBeTruthy();

    await user.type(input, "{Backspace}8");
    answer();

    await screen.findByRole("button", { name: "Add" });
    expect(queued()).toEqual([]);
    expect(input).toHaveProperty("value", "41208");
  });

  it("adds a CRN Banner couldn't check, with a note", async () => {
    server.use(
      http.get(`${API}/classes/terms/:term/sections/:crn`, () =>
        HttpResponse.json(
          { detail: "Banner isn't answering." },
          { status: 502 },
        ),
      ),
    );
    const { user, input } = setUp();
    await user.type(input, "41207{Enter}");

    await waitFor(() => expect(queued()).toEqual(["41207"]));
    const note = screen.getByRole("status");
    expect(note.textContent).toBe(
      "Added 41207, but Banner couldn't check it. Make sure it's right before registering.",
    );
    expect(input.getAttribute("aria-describedby")).toBe(note.id);
  });
});
