import type { AcademicCourse, AcademicTranscript } from "@workspace/api-client";
import type {
  AcademicTranscriptPageData,
  TranscriptPeriod,
} from "../types/banner/academic-transcript";
import { isRecord } from "./guards";
import { formatTermName } from "./terms";

const SEASON_ORDER = ["winter", "spring", "summer", "fall"];
const TERM_LABEL = /^(winter|spring|summer|fall)\b.*?(\d{4})$/i;
/** The level totals row whose GPA is the transcript's, as on the PDF. */
const OVERALL_TOTALS = "Overall";

/**
 * A course as it's kept: its code, title, credits and grade, whether it was
 * taken at Temple, transferred in or is in progress, and Banner's repeat flag,
 * which together say whether it counts toward the GPA.
 */
export type SavedCourse = Pick<
  AcademicCourse,
  | "subject"
  | "courseNumber"
  | "title"
  | "grade"
  | "credits"
  | "term"
  | "category"
  | "repeat"
>;

/** What's kept from a transcript: its courses and the GPA. */
export interface TranscriptData {
  courses: SavedCourse[];
  gpa: number | null;
}

export interface TranscriptTerm {
  /** As the transcript names it, e.g. "Fall 2024". */
  term: string;
  courses: SavedCourse[];
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
  const byTerm = new Map<string, SavedCourse[]>();
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

/** Keeps only the saved fields, with Banner's "2024 Fall" terms named "Fall 2024". */
export function savedTranscript(
  transcript: AcademicTranscript,
): TranscriptData {
  return {
    courses: transcript.courses.map((course) => ({
      subject: course.subject,
      courseNumber: course.courseNumber,
      title: course.title,
      grade: course.grade,
      credits: course.credits,
      term: formatTermName(course.term),
      category: course.category,
      repeat: course.repeat,
    })),
    gpa: transcript.gpa,
  };
}

/** The extension's look at Banner Self-Service's transcript. */
export type TranscriptLookup =
  { status: "found"; transcript: TranscriptData } | { status: "signed-out" };

/** Whether Self-Service answered with the transcript blocks `bannerTranscript` reads. */
export function isAcademicTranscriptPageData(
  value: unknown,
): value is AcademicTranscriptPageData {
  return (
    isRecord(value) &&
    typeof value.hasError === "boolean" &&
    isRecord(value.institutionCredit) &&
    isRecord(value.courseInProgress) &&
    isRecord(value.viewtransferCreditData) &&
    Array.isArray(value.viewtransferCreditData.transferCreditList) &&
    Array.isArray(value.totalTranscript)
  );
}

/** Banner's decimal strings ("4.000"), which must hold a number. */
function bannerNumber(value: string): number {
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number)) {
    throw new Error(`Banner's transcript has "${value}" where a number goes.`);
  }
  return number;
}

/** Each period of a by-term block, with the term named season first. */
function periodsByTerm<Course>(
  byTermCode: Record<string, TranscriptPeriod<Course>[]>,
): { term: string; courses: Course[] }[] {
  return Object.entries(byTermCode).flatMap(([termCode, periods]) =>
    periods.map((period) => ({
      term: formatTermName(period.infoMap[0]?.period ?? termCode),
      courses: period.subjectGrid,
    })),
  );
}

function institutionCourses(page: AcademicTranscriptPageData): SavedCourse[] {
  return periodsByTerm(page.institutionCredit).flatMap(({ term, courses }) =>
    courses.map((course) => ({
      subject: course.subjectCode,
      courseNumber: course.courseNumber,
      title: course.title.find((title) => !!title) ?? "",
      grade: course.grade,
      credits: bannerNumber(course.creditHours),
      term,
      category: "institution",
      repeat: course.r || null,
    })),
  );
}

function inProgressCourses(page: AcademicTranscriptPageData): SavedCourse[] {
  return periodsByTerm(page.courseInProgress).flatMap(({ term, courses }) =>
    courses.map((course) => ({
      subject: course.subjectCode,
      courseNumber: course.courseNumber,
      title: course.title,
      grade: "",
      credits: bannerNumber(course.creditHours),
      term,
      category: "in_progress",
      repeat: null,
    })),
  );
}

/** Transfer credit, under its attendance period ("Spring,23") as the PDF names it. */
function transferCourses(page: AcademicTranscriptPageData): SavedCourse[] {
  return page.viewtransferCreditData.transferCreditList.flatMap((period) =>
    period.transferCreditInfo.map((course) => ({
      subject: course.subject,
      courseNumber: course.course,
      title: course.title,
      grade: course.grade,
      credits: bannerNumber(course.creditHours),
      term: period.periodSeqNo,
      category: "transfer",
      repeat: course.rVal || null,
    })),
  );
}

function overallGpa(page: AcademicTranscriptPageData): number | null {
  const overall = page.totalTranscript
    .flatMap((level) => level.transcriptTotalsGrid)
    .findLast((row) => row.firstColumn === OVERALL_TOTALS);
  return overall ? bannerNumber(overall.gpa) : null;
}

/** What's kept from Self-Service's transcript data: the same fields as from the PDF. */
export function bannerTranscript(
  page: AcademicTranscriptPageData,
): TranscriptData {
  return {
    courses: [
      ...institutionCourses(page),
      ...transferCourses(page),
      ...inProgressCourses(page),
    ],
    gpa: overallGpa(page),
  };
}
