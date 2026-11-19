import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { API, http, HttpResponse, server } from "@workspace/api-client/testing";
import { createQueryClient } from "@/lib/query-client";
import { useCrnLookup } from "./use-auto-register";

const TERM = "202703";
const FOUND = {
  crn: "41207",
  title: "Data Structures",
  subject: "CIS",
  courseNumber: "2168",
  section: "001",
};
const BANNER_DOWN = 502;
const NOT_FOUND = 404;

let lookups = 0;

function answer(status: number) {
  server.use(
    http.get(`${API}/classes/terms/:term/sections/:crn`, () => {
      lookups += 1;
      return status === 200
        ? HttpResponse.json(FOUND)
        : HttpResponse.json({ detail: "No." }, { status });
    }),
  );
}

function lookUp(term = TERM) {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCrnLookup(term), { wrapper }).result.current;
}

beforeEach(() => {
  lookups = 0;
});

describe("useCrnLookup", () => {
  it("finds a CRN Banner has", async () => {
    answer(200);
    await expect(lookUp()("41207")).resolves.toBe("found");
  });

  it("remembers a CRN Banner doesn't have", async () => {
    answer(NOT_FOUND);
    const check = lookUp();
    await expect(check("52018")).resolves.toBe("missing");
    await expect(check("52018")).resolves.toBe("missing");
    expect(lookups).toBe(1);
  });

  it("asks again after Banner couldn't answer", async () => {
    answer(BANNER_DOWN);
    const check = lookUp();
    await expect(check("41207")).resolves.toBe("unchecked");
    const afterFirst = lookups;
    await expect(check("41207")).resolves.toBe("unchecked");
    expect(lookups).toBeGreaterThan(afterFirst);
  });

  it("doesn't ask without a term", async () => {
    answer(200);
    await expect(lookUp("")("41207")).resolves.toBe("unchecked");
    expect(lookups).toBe(0);
  });
});
