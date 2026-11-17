import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleAudit } from "@workspace/shared/testing/audit";
import { renderPage } from "@/test/render";
import { RecordsLayout } from "./records-layout";

const SAVED_AT = "2026-11-15T15:00:00.000Z";

function tab(name: RegExp) {
  return screen.getByRole("link", { name });
}

describe("RecordsLayout", () => {
  it("links each tab to its page and marks the one shown", () => {
    renderPage(<RecordsLayout>{null}</RecordsLayout>, {
      route: "/records/transcript",
    });
    expect(tab(/^Degree audit/).getAttribute("href")).toBe("/records/audit");
    expect(tab(/^Transcript/).getAttribute("href")).toBe("/records/transcript");
    expect(tab(/^Transcript/).getAttribute("aria-current")).toBe("page");
    expect(tab(/^Degree audit/).getAttribute("aria-current")).toBeNull();
  });

  it("says which records are saved", async () => {
    const { store } = renderPage(<RecordsLayout>{null}</RecordsLayout>, {
      route: "/records/audit",
    });
    expect(tab(/^Degree audit/).getAttribute("aria-current")).toBe("page");
    expect(await screen.findAllByText("Not added yet")).toHaveLength(2);

    await store.set("audit", { audit: sampleAudit(), storedAt: SAVED_AT });
    expect(await screen.findByText("Saved Nov 15")).toBeTruthy();
    expect(screen.getAllByText("Not added yet")).toHaveLength(1);
  });
});
