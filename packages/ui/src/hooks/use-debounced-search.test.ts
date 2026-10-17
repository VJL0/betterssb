import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedSearch } from "./use-debounced-search";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useDebouncedSearch", () => {
  it("doesn't search short queries", async () => {
    const search = vi.fn(async () => ["x"]);
    const { result } = renderHook(() => useDebouncedSearch("a", search));
    await flush(500);
    expect(search).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      results: [],
      isLoading: false,
      hasError: false,
    });
  });

  it("searches once typing pauses and reports loading until then", async () => {
    const search = vi.fn(async (q: string) => [`${q} result`]);
    const { result, rerender } = renderHook(
      ({ q }) => useDebouncedSearch(q, search),
      { initialProps: { q: "te" } },
    );
    expect(result.current.isLoading).toBe(true);
    rerender({ q: "tem" });
    rerender({ q: "temp" });
    await flush(300);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("temp");
    expect(result.current).toEqual({
      results: ["temp result"],
      isLoading: false,
      hasError: false,
    });
  });

  it("drops a slow answer to an older query", async () => {
    let resolveOld: (v: string[]) => void = () => {};
    const search = vi.fn((q: string) =>
      q === "old"
        ? new Promise<string[]>((r) => {
            resolveOld = r;
          })
        : Promise.resolve(["new result"]),
    );
    const { result, rerender } = renderHook(
      ({ q }) => useDebouncedSearch(q, search),
      { initialProps: { q: "old" } },
    );
    await flush(300);
    rerender({ q: "new" });
    await flush(300);
    resolveOld(["old result"]);
    await flush(0);
    expect(result.current.results).toEqual(["new result"]);
  });

  it("reports a failed search", async () => {
    const search = vi.fn(async () => {
      throw new Error("down");
    });
    const { result } = renderHook(() => useDebouncedSearch("temple", search));
    await flush(300);
    expect(result.current).toEqual({
      results: [],
      isLoading: false,
      hasError: true,
    });
  });
});
