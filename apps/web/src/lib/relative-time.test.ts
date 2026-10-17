import { describe, expect, it } from "vitest";
import { formatUpdated } from "./relative-time";

const NOW = Date.UTC(2026, 9, 17, 18, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatUpdated", () => {
  it.each([
    [10_000, "just now"],
    [2 * 60_000, "2 minutes ago"],
    [60 * 60_000, "1 hour ago"],
    [3 * 60 * 60_000, "3 hours ago"],
  ])("describes %i ms ago as %j", (ms, text) => {
    expect(formatUpdated(ago(ms), NOW)).toBe(text);
  });

  it("is empty for an unreadable time", () => {
    expect(formatUpdated("nope", NOW)).toBe("");
  });
});
