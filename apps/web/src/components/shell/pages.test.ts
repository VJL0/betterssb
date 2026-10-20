import { describe, expect, it } from "vitest";
import { PRIMARY_PAGES, firstReadyPath, readyPages } from "./pages";

describe("pages", () => {
  it("lists only pages that are built", () => {
    expect(readyPages(PRIMARY_PAGES).every((p) => p.ready)).toBe(true);
  });

  it("starts planning on the first built page", () => {
    const first = readyPages(PRIMARY_PAGES)[0];
    expect(firstReadyPath()).toBe(first?.path ?? "/settings");
  });
});
