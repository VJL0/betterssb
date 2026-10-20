import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBannerConnection } from "./use-banner-connection";

afterEach(() => {
  vi.useRealTimers();
});

describe("useBannerConnection", () => {
  it("stops looking for the extension when the page unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useBannerConnection());
    unmount();
    // A poll left running would touch the page after it's gone.
    expect(vi.getTimerCount()).toBe(0);
  });
});
