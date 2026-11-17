import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExtensionInstalled } from "./use-extension-installed";

afterEach(() => {
  vi.useRealTimers();
});

describe("useExtensionInstalled", () => {
  it("stops looking for the extension when the page unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useExtensionInstalled());
    unmount();
    // A poll left running would touch the page after it's gone.
    expect(vi.getTimerCount()).toBe(0);
  });
});
