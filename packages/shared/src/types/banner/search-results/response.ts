import type { Section } from "./section";

/**
 * Set by the `mode` of the `term/search` call that opened the session; the
 * catalog's "View Sections" gets "courseSearch".
 */
export type PathMode = "search" | "registration" | "plan" | "courseSearch";

/**
 * `GET /ssb/searchResults/searchResults`. Discriminate on `data`: it is null
 * when the session never picked a term (`term/search` was skipped or used
 * another `uniqueSessionId`), which Banner answers with `success: true`.
 */
export type SearchResultsResponse =
  SearchResultsPage | SearchResultsOtherTerm | SearchResultsWithoutTerm;

export interface SearchResultsPage {
  success: boolean;
  /** Matching sections across all pages. */
  totalCount: number;
  /** Equals `totalCount`, not the length of this page. */
  sectionsFetchedCount: number;
  pageOffset: number;
  /** Echoes the request; Banner accepts at least 500. */
  pageMaxSize: number;
  pathMode: PathMode;
  /** Empty, not null, once `pageOffset` is past `totalCount`. */
  data: Section[];
  /** Only on the page at `pageOffset` 0; null on later pages. */
  searchResultsConfigs: SearchResultsConfig[] | null;
  /**
   * The zero-textbook-cost badge as a `data:image/png;base64,…` URI (~30 KB).
   * Null on a page past the end.
   */
  ztcEncodedImage: string | null;
}

/**
 * The session picked a term, but `txt_term` is left out or names another
 * term: `data` is null while `pathMode` and the column configs still come.
 */
export interface SearchResultsOtherTerm {
  success: true;
  totalCount: 0;
  sectionsFetchedCount: 0;
  pageOffset: number;
  pageMaxSize: number;
  pathMode: PathMode;
  data: null;
  searchResultsConfigs: SearchResultsConfig[];
  ztcEncodedImage: null;
}

export interface SearchResultsWithoutTerm {
  success: boolean;
  totalCount: 0;
  sectionsFetchedCount: 0;
  pageOffset: number;
  pageMaxSize: number;
  pathMode: null;
  data: null;
  searchResultsConfigs: null;
  ztcEncodedImage: null;
}

/** A results-table column as the school configured it. */
export interface SearchResultsConfig {
  config: SearchResultsColumn;
  /** Column header ("CRN", "Meeting Times"). */
  display: string;
  title: string;
  required: boolean;
  /** CSS width as a percentage string ("5%"). */
  width: string;
}

export type SearchResultsColumn =
  | "partOfTerm"
  | "courseReferenceNumber"
  | "subjectCourseSectionNumber"
  | "subject"
  | "courseNumber"
  | "sequenceNumber"
  | "campus"
  | "creditHours"
  | "courseTitle"
  | "meetingTime"
  | "status"
  | "instructor"
  | "bookstores"
  | "attribute"
  | "feeAmount"
  | (string & {});
