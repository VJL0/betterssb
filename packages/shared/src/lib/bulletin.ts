/**
 * Temple's academic year runs Fall through Summer, and each year has its own
 * Bulletin (catalog). A student usually follows the Bulletin of the year they
 * started in, but Temple sets their official catalog year, so the app only
 * ever suggests one.
 */

export interface StartTerm {
  /** Temple Banner term code: the year, then 03 Spring, 20 Summer or 36 Fall. */
  code: string;
  /** "Fall YYYY". */
  name: string;
}

/** Years of start terms to offer; a Bulletin that isn't online shows an error. */
const START_TERM_YEARS = 8;
const FALL_CODE = "36";
const TERM_CODE = /^(\d{4})(\d{2})$/;

/** The terms a student can start in, in calendar order, with the month each begins. */
const START_SEASONS = [
  { code: "03", name: "Spring", startMonth: 0 },
  { code: "20", name: "Summer", startMonth: 4 },
  { code: FALL_CODE, name: "Fall", startMonth: 7 },
] as const;

/**
 * The Bulletin year ("YYYY-YYYY") a start term suggests: a Fall start's own
 * academic year, or the one Spring and Summer finish. Null for a code
 * outside Temple's scheme.
 */
export function suggestedBulletinYear(termCode: string): string | null {
  const match = TERM_CODE.exec(termCode);
  if (!match) return null;
  const year = Number(match[1]);
  const firstYear = match[2] === FALL_CODE ? year : year - 1;
  return `${firstYear}-${firstYear + 1}`;
}

/**
 * Start terms newest first: the next term to begin after `today`, for
 * incoming students, back through the last `START_TERM_YEARS` years.
 */
export function startTermOptions(today: Date): StartTerm[] {
  const terms: StartTerm[] = [];
  for (let year = today.getFullYear() - START_TERM_YEARS; ; year++) {
    for (const season of START_SEASONS) {
      terms.push({
        code: `${year}${season.code}`,
        name: `${season.name} ${year}`,
      });
      if (new Date(year, season.startMonth, 1) > today) return terms.reverse();
    }
  }
}
