import type {
  CodeDescription,
  SearchSectionsData,
} from "@workspace/api-client";

/**
 * How a section is taught, grouped from Temple's instructional methods
 * (Banner's `get_instructionalMethod` list). Field work and independent
 * study (NCLAS) belong to none of them.
 */
export const FORMATS = {
  inPerson: { label: "In person", methods: ["CLAS", "LAB", "STDO", "CBL"] },
  hybrid: { label: "Hybrid", methods: ["HYBR", "HYB2"] },
  live: { label: "Live online", methods: ["VIRT", "VRT2", "VIDEO"] },
  async: { label: "Async online", methods: ["OLL"] },
} as const;
export type Format = keyof typeof FORMATS;

/** Temple names every GenEd area attribute "GenEd <area>". */
export const GENED_PREFIX = "GenEd ";

export function isGenEdArea(attribute: CodeDescription): boolean {
  return attribute.description.startsWith(GENED_PREFIX);
}

/** Course numbers by thousand; 5000 and up are graduate courses. */
export const COURSE_LEVELS = [0, 1000, 2000, 3000, 4000, 5000] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];
const LEVEL_SPAN = 1000;
const GRADUATE_LEVEL = 5000;
const HIGHEST_COURSE_NUMBER = 9999;
/** The API's shortest instructor name; one letter matches half the faculty. */
const MIN_INSTRUCTOR_LENGTH = 2;

/**
 * Filters Banner applies to the search, so they hold for every section in
 * the term rather than only the pages loaded so far.
 */
export interface BannerFilters {
  formats: Format[];
  levels: CourseLevel[];
  /** Any of these attribute codes, such as GenEd areas. */
  attributes: string[];
  campus: string | null;
  partOfTerm: string | null;
  /** Any part of an instructor's name: first, last or both, in any order. */
  instructor: string;
}

export const DEFAULT_BANNER_FILTERS: BannerFilters = {
  formats: [],
  levels: [],
  attributes: [],
  campus: null,
  partOfTerm: null,
  instructor: "",
};

type BannerQuery = Omit<
  SearchSectionsData["query"],
  "term" | "subject" | "courseNumber" | "keyword" | "offset" | "limit"
>;

export function courseLevel(courseNumber: string): CourseLevel {
  const thousands = Math.floor(Number.parseInt(courseNumber, 10) / LEVEL_SPAN);
  return Math.min(thousands * LEVEL_SPAN, GRADUATE_LEVEL) as CourseLevel;
}

function instructorName(filters: BannerFilters): string | undefined {
  const name = filters.instructor.trim().replace(/\s+/g, " ");
  return name.length >= MIN_INSTRUCTOR_LENGTH ? name : undefined;
}

/**
 * Banner takes one course number range, so picking 1000 and 3000 asks for
 * 1000–3999; `sectionPasses` drops the 2000s.
 */
function levelRange(levels: readonly CourseLevel[]): BannerQuery {
  if (levels.length === 0) return {};
  const highest = Math.max(...levels);
  return {
    courseNumberFrom: String(Math.min(...levels)),
    courseNumberTo: String(
      highest === GRADUATE_LEVEL
        ? HIGHEST_COURSE_NUMBER
        : highest + LEVEL_SPAN - 1,
    ),
  };
}

/** The search parameters for these filters, leaving out the unset ones. */
export function bannerQuery(filters: BannerFilters): BannerQuery {
  const methods = filters.formats.flatMap((f) => FORMATS[f].methods);
  const instructor = instructorName(filters);
  return {
    ...(filters.attributes.length > 0 && { attribute: filters.attributes }),
    ...(methods.length > 0 && { instructionalMethod: methods }),
    ...(filters.campus && { campus: [filters.campus] }),
    ...(filters.partOfTerm && { partOfTerm: [filters.partOfTerm] }),
    ...levelRange(filters.levels),
    ...(instructor && { instructor }),
  };
}

/**
 * An attribute or an instructor narrows the term enough to search without
 * a course or keyword ("GenEd Arts, online"); the other filters don't.
 */
export function canSearchWithoutText(filters: BannerFilters): boolean {
  return filters.attributes.length > 0 || instructorName(filters) !== undefined;
}

export function hasBannerFilters(filters: BannerFilters): boolean {
  return Object.keys(bannerQuery(filters)).length > 0;
}
