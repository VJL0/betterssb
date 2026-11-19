/**
 * Query string of `GET /ssb/searchResults/searchResults`. Every value is a
 * string; lists are comma-separated codes ("ACCT,ACMS"). Banner's own page
 * sends free text percent-encoded twice ("hey%2520title").
 *
 * Before the first search, `POST /ssb/term/search?mode=search` with `term`
 * and the same `uniqueSessionId` (and the cookies that call sets), or every
 * search comes back with `data: null`.
 */
export type SearchResultsQuery = SearchResultsBaseQuery &
  SearchResultsFilters &
  DayFilters &
  TimeFilters;

interface SearchResultsBaseQuery {
  txt_term: string;
  /** Any unique string; Banner's page uses 5 random characters + epoch ms. */
  uniqueSessionId: string;
  pageOffset: string;
  pageMaxSize: string;
  /** Banner's page always sends "subjectDescription". */
  sortColumn: string;
  sortDirection: "asc" | "desc";
  /** Sent empty by Banner's page. */
  startDatepicker?: string;
  endDatepicker?: string;
}

interface SearchResultsFilters {
  txt_subject?: string;
  txt_courseNumber?: string;
  /** Lower bound of a course number range, four digits ("1000"). */
  txt_course_number_range?: string;
  /** Upper bound, four digits ("2999"). */
  txt_course_number_range_to?: string;
  /** `subjectCourse` of one course ("ADV0853"). */
  txt_subjectcoursecombo?: string;
  txt_keywordall?: string;
  txt_keywordany?: string;
  txt_keywordlike?: string;
  txt_courseTitle?: string;
  txt_partOfTerm?: string;
  /**
   * Codes from `get_campus` ("AMB", "MN"), the same list as a meeting's
   * `campus`, but matched against the section's own campus: in 2027 Spring
   * "AMB" found the 71 sections whose `campusDescription` is "Ambler", only
   * 36 of which meet there.
   */
  txt_campus?: string;
  /** College code ("HP"). */
  txt_college?: string;
  txt_instructionalMethod?: string;
  txt_attribute?: string;
  /**
   * Codes from `GET /ssb/classSearch/get_instructor`, valid only in the
   * session that looked them up. A guest's `Faculty.bannerId` is that same
   * session-scoped code (seen for two instructors).
   */
  txt_instructor?: string;
  /** Session code ("D"). */
  txt_session?: string;
  txt_credithourlow?: string;
  txt_credithourhigh?: string;
}

/** 0 is Sunday through 6 is Saturday, as in `Date.getDay()`. */
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DayFilters = {
  [Day in `chk_include_${DayIndex}`]?: "true";
};

/** Banner's page sends all three fields of a bound or none. */
interface TimeFilters {
  /** "01" to "12". */
  select_start_hour?: string;
  /** Two digits ("05"). */
  select_start_min?: string;
  select_start_ampm?: "AM" | "PM";
  select_end_hour?: string;
  select_end_min?: string;
  select_end_ampm?: "AM" | "PM";
}
