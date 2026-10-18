import { searchSchools, type RmpSchool } from "@workspace/api-client";

/** Rate My Professors schools matching what the student typed, for the school picker. */
export async function findSchools(query: string): Promise<RmpSchool[]> {
  const { data } = await searchSchools({
    query: { query },
    meta: { errorMessage: "Couldn't search schools." },
  });
  return data;
}
