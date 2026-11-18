import type { Metadata } from "next";

/** Pages that show a student's own saved data, which has nothing to index. */
export const NOT_INDEXED: Metadata["robots"] = { index: false };
