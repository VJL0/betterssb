import type { RMPRating, RMPSchool } from "@workspace/shared/types";
import { requestJson } from "./http";

export function searchSchools(
  query: string,
  signal?: AbortSignal,
): Promise<RMPSchool[]> {
  return requestJson("/rmp/schools", {
    signal,
    query: { query },
    errorMessage: "Couldn't search schools.",
  });
}

/** The best Rate My Professors match for an instructor at a school, or null. */
export async function fetchRating(
  name: string,
  schoolId: string,
  signal?: AbortSignal,
): Promise<RMPRating | null> {
  const matches = await requestJson<RMPRating[]>("/rmp/search", {
    signal,
    query: { name, school_id: schoolId },
    errorMessage: "Couldn't load instructor ratings.",
  });
  return matches[0] ?? null;
}
