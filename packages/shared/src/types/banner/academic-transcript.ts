/**
 * `GET /StudentSelfService/ssb/academicTranscript/academicTranscriptPageData?level=&type=ADV`
 * on prd-xe.temple.edu, the data behind Self-Service's "Academic Transcript"
 * page. Unlike the registration routes, it lives in the separate
 * StudentSelfService app, which has its own `JSESSIONID` and its own CAS
 * sign-in; a signed-out request is a 302 to fim.temple.edu.
 *
 * Written from the user's signed-in HAR of 2026-11-17 (one undergraduate with
 * five Temple terms, two AP credit periods and two registered terms). Only
 * the fields BetterSSB reads are typed. The response also carries
 * `viewTranscript`, the same transcript as Banner's PL/SQL record fields
 * (`loop_7`, `shrtckg_tranc_rec_…`), student and degree details, and the
 * page's section links.
 *
 * Every number is a string with Banner's decimals ("4.000" hours, "3.44"
 * GPA). No `X-Synchronizer-Token` is needed.
 */

export interface AcademicTranscriptPageData {
  /** False in the HAR, whose `errorList` was empty. */
  hasError: boolean;
  /** Temple courses with a final grade, by term code ("202436"). */
  institutionCredit: Record<string, TranscriptPeriod<InstitutionCourse>[]>;
  /** Registered courses without a final grade yet, by term code. */
  courseInProgress: Record<string, TranscriptPeriod<InProgressCourse>[]>;
  viewtransferCreditData: { transferCreditList: TransferCreditPeriod[] };
  /** One entry per level. */
  totalTranscript: { transcriptTotalsGrid: TranscriptTotals[] }[];
}

export interface TranscriptPeriod<Course> {
  /** Always one entry; `period` is year first, as Banner names terms ("2024 Fall"). */
  infoMap: { period: string }[];
  subjectGrid: Course[];
}

export interface InstitutionCourse {
  subjectCode: string;
  courseNumber: string;
  /** The title, then the long title, which is null when the course has none. */
  title: (string | null)[];
  /** "A", "B+", "W", "CR"… */
  grade: string;
  creditHours: string;
  /** Banner's repeat flag ("E" for an attempt a later one replaced); null in the HAR, where nothing was repeated. */
  r: string | null;
}

export interface InProgressCourse {
  subjectCode: string;
  courseNumber: string;
  title: string;
  creditHours: string;
}

export interface TransferCreditPeriod {
  /** The attendance period, season and two-digit year ("Spring,23"). */
  periodSeqNo: string;
  transferCreditInfo: TransferCourse[];
}

export interface TransferCourse {
  subject: string;
  course: string;
  title: string;
  /** "TR" transferred, "NT" not transferred. */
  grade: string;
  creditHours: string;
  /** The repeat flag, empty for a first attempt. */
  rVal: string;
}

export interface TranscriptTotals {
  /** "Total Institution", "Total Transfer" and "Overall". */
  firstColumn: string;
  gpa: string;
}
