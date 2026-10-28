import {
  DAY_NAMES,
  formatTimeOfDay,
} from "@workspace/shared/lib/meeting-times";
import type { CodeDescription } from "@workspace/api-client";
import { FORMATS } from "./banner-filters";
import {
  LEVEL_LABEL,
  maxDifficultyLabel,
  minRatingLabel,
  partOfTermName,
} from "./filter-labels";
import { QUICK_FILTERS, type QuickFilterContext } from "./quick-filters";
import { DEFAULT_FILTERS, type SearchFilters } from "./search-filters";

/** One removable thing a student filtered by; times are one, not two. */
export type FilterDimension =
  | "openOnly"
  | "days"
  | "times"
  | "minRating"
  | "maxDifficulty"
  | "instructor"
  | "formats"
  | "campus"
  | "levels"
  | "attributes"
  | "partOfTerm";

const DIMENSION_KEYS: Record<FilterDimension, (keyof SearchFilters)[]> = {
  openOnly: ["openOnly"],
  days: ["days"],
  times: ["startAfter", "endBefore"],
  partOfTerm: ["partOfTerm"],
  minRating: ["minRating"],
  maxDifficulty: ["maxDifficulty"],
  instructor: ["instructor"],
  formats: ["formats"],
  campus: ["campus"],
  levels: ["levels"],
  attributes: ["attributes"],
};

/** Attributes listed by name before the rest become "+2". */
const NAMED_ATTRIBUTES = 2;

export interface FilterNames {
  attributes: CodeDescription[];
  campuses: CodeDescription[];
  partsOfTerm: CodeDescription[];
}

export interface AppliedFilter {
  dimension: FilterDimension;
  label: string;
}

function describe(code: string, options: CodeDescription[]): string {
  return options.find((o) => o.code === code)?.description ?? code;
}

function timesLabel({ startAfter, endBefore }: SearchFilters): string {
  if (startAfter !== null && endBefore !== null) {
    return `${formatTimeOfDay(startAfter)}–${formatTimeOfDay(endBefore)}`;
  }
  return startAfter !== null
    ? `Starts after ${formatTimeOfDay(startAfter)}`
    : `Ends by ${formatTimeOfDay(endBefore!)}`;
}

function attributesLabel(codes: string[], options: CodeDescription[]) {
  const names = codes.map((code) => describe(code, options));
  const rest = names.length - NAMED_ATTRIBUTES;
  return rest > 0
    ? `${names.slice(0, NAMED_ATTRIBUTES).join(", ")} +${rest}`
    : names.join(", ");
}

const LABELS: Record<
  FilterDimension,
  (f: SearchFilters, names: FilterNames) => string
> = {
  openOnly: () => "Open seats",
  days: (f) =>
    f.days.length === 0
      ? "No days"
      : f.days.map((d) => DAY_NAMES[d].slice(0, 3)).join(" "),
  times: timesLabel,
  partOfTerm: (f, n) => partOfTermName(describe(f.partOfTerm!, n.partsOfTerm)),
  minRating: (f) => `Rating ${minRatingLabel(f.minRating)}`,
  maxDifficulty: (f) => `Difficulty ${maxDifficultyLabel(f.maxDifficulty)}`,
  instructor: (f) => `Instructor: ${f.instructor.trim()}`,
  formats: (f) => f.formats.map((format) => FORMATS[format].label).join(", "),
  campus: (f, n) => describe(f.campus!, n.campuses),
  levels: (f) =>
    `Level ${[...f.levels]
      .sort((a, b) => a - b)
      .map((level) => LEVEL_LABEL[level].short)
      .join(", ")}`,
  attributes: (f, n) => attributesLabel(f.attributes, n.attributes),
};

function valueOf(filters: SearchFilters, dimension: FilterDimension): string {
  return JSON.stringify(
    DIMENSION_KEYS[dimension].map((key) => {
      const value = filters[key];
      // Spaces typed in the instructor box filter nothing.
      return typeof value === "string" ? value.trim() : value;
    }),
  );
}

/**
 * Where the filters stand with only the pressed quick filters on: the
 * baseline a chip row beside those toggles leaves out, and resets to.
 */
export function quickFilterBase(
  filters: SearchFilters,
  context: QuickFilterContext,
): SearchFilters {
  return QUICK_FILTERS.filter((q) => q.isOn(filters, context)).reduce(
    (base, q) => q.turn(base, true, context),
    DEFAULT_FILTERS,
  );
}

/** What differs from `base`, in the filters panel's order, as chip labels. */
export function appliedFilters(
  filters: SearchFilters,
  names: FilterNames,
  base: SearchFilters = DEFAULT_FILTERS,
): AppliedFilter[] {
  return (Object.keys(DIMENSION_KEYS) as FilterDimension[])
    .filter((d) => valueOf(filters, d) !== valueOf(base, d))
    .map((dimension) => ({
      dimension,
      label: LABELS[dimension](filters, names),
    }));
}

export function removeFilter(
  filters: SearchFilters,
  dimension: FilterDimension,
  base: SearchFilters = DEFAULT_FILTERS,
): SearchFilters {
  const reset = Object.fromEntries(
    DIMENSION_KEYS[dimension].map((key) => [key, base[key]]),
  );
  return { ...filters, ...reset };
}
