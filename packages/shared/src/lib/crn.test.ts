import { describe, expect, it } from "vitest";
import { isCrn } from "./crn";

describe("isCrn", () => {
  it.each(["41207", "4354"])("accepts %j", (text) => {
    expect(isCrn(text)).toBe(true);
  });

  it.each(["123", "412070", "4120a", " 4120", ""])("rejects %j", (text) => {
    expect(isCrn(text)).toBe(false);
  });
});
