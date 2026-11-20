/**
 * Reads the student's academic transcript from Banner Self-Service, from the
 * background script, with the student's existing Self-Service session.
 */
import {
  bannerTranscript,
  isAcademicTranscriptPageData,
  type TranscriptLookup,
} from "@workspace/shared/lib/transcript";
import { isSignedOutAnswer, signedInFetch } from "@/lib/signed-in-fetch";
import { TRANSCRIPT_DATA_URL } from "@/lib/temple-urls";

export async function lookUpTranscript(): Promise<TranscriptLookup> {
  // Accepts JSON as Self-Service's own page does.
  const res = await signedInFetch(TRANSCRIPT_DATA_URL, {
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (isSignedOutAnswer(res)) return { status: "signed-out" };
  if (!res.ok) throw new Error(`Banner returned HTTP ${res.status}`);

  const page: unknown = await res.json().catch(() => null);
  if (!isAcademicTranscriptPageData(page) || page.hasError) {
    throw new Error("Couldn't read your transcript from Banner.");
  }
  return { status: "found", transcript: bannerTranscript(page) };
}
