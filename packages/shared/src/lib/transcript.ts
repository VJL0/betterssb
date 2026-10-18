import type { TranscriptCourse, TranscriptData } from "@workspace/api-client";

const SEASON_ORDER = ["winter", "spring", "summer", "fall"];
const TERM_LABEL = /^(winter|spring|summer|fall)\b.*?(\d{4})$/i;

export interface TranscriptTerm {
  /** As the transcript names it, e.g. "Fall 2024". */
  term: string;
  courses: TranscriptCourse[];
  credits: number;
}

/** Sort key for "Fall 2024"-style terms; null if the label isn't one. */
function termOrder(label: string): number | null {
  const match = TERM_LABEL.exec(label.trim());
  if (!match) return null;
  const season = SEASON_ORDER.indexOf(match[1]!.toLowerCase());
  return Number(match[2]) * SEASON_ORDER.length + season;
}

/** Dated terms newest first; terms it can't date go last, in their order. */
function newestFirst(a: TranscriptTerm, b: TranscriptTerm): number {
  const x = termOrder(a.term);
  const y = termOrder(b.term);
  if (x !== null && y !== null) return y - x;
  if (x !== null) return -1;
  if (y !== null) return 1;
  return 0;
}

/** Courses grouped by term, newest first. Terms it can't date keep their order, last. */
export function transcriptTerms(data: TranscriptData): TranscriptTerm[] {
  const byTerm = new Map<string, TranscriptCourse[]>();
  for (const course of data.courses) {
    byTerm.set(course.term, [...(byTerm.get(course.term) ?? []), course]);
  }
  return [...byTerm]
    .map(([term, courses]) => ({
      term,
      courses,
      credits: courses.reduce((sum, c) => sum + c.credits, 0),
    }))
    .sort(newestFirst);
}
