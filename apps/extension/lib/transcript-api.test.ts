import { afterEach, describe, expect, it, vi } from "vitest";
import { stoppedRedirect } from "@/test/responses";
import { sampleTranscriptPage } from "@workspace/shared/testing/academic-transcript";
import { lookUpTranscript } from "./transcript-api";

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

afterEach(() => vi.unstubAllGlobals());

describe("lookUpTranscript", () => {
  it("reads the Advising Transcript with the student's cookies", async () => {
    stubFetch(Response.json(sampleTranscriptPage()));
    const lookup = await lookUpTranscript();
    expect(lookup.status).toBe("found");
    expect(lookup.status === "found" && lookup.transcript.gpa).toBe(3.5);
    expect(fetch).toHaveBeenCalledWith(
      "https://prd-xe.temple.edu/StudentSelfService/ssb/academicTranscript/academicTranscriptPageData?level=&type=ADV",
      {
        credentials: "include",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json, text/plain, */*" },
      },
    );
  });

  it.each([
    ["a redirect to sign in", stoppedRedirect()],
    ["a 401", new Response("", { status: 401 })],
  ])("is signed out on %s", async (_name, response) => {
    stubFetch(response);
    await expect(lookUpTranscript()).resolves.toEqual({ status: "signed-out" });
  });

  it.each([
    [
      "an HTTP error",
      new Response("", { status: 500 }),
      "Banner returned HTTP 500",
    ],
    [
      "an HTML page",
      new Response("<!DOCTYPE html><title>Error</title>"),
      "Couldn't read your transcript from Banner.",
    ],
    [
      "JSON that isn't the transcript",
      Response.json({ ok: true }),
      "Couldn't read your transcript from Banner.",
    ],
    [
      "Banner's own error",
      Response.json({ ...sampleTranscriptPage(), hasError: true }),
      "Couldn't read your transcript from Banner.",
    ],
  ])("fails on %s", async (_name, response, message) => {
    stubFetch(response);
    await expect(lookUpTranscript()).rejects.toThrow(message);
  });
});
