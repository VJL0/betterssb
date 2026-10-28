const BANNER_TERM_NAME = /^(\d{4})\s+(.+)$/;
const VIEW_ONLY = /\s*\(view only\)\s*/i;

/** Banner marks past terms "(View Only)": their schedule can be read but not registered for. */
export function isViewOnlyTerm(bannerDescription: string): boolean {
  return VIEW_ONLY.test(bannerDescription);
}

/** Banner names terms year first ("2027 Spring"); students read "Spring 2027". */
export function formatTermName(bannerDescription: string): string {
  const plain = bannerDescription.replace(VIEW_ONLY, " ").trim();
  const match = BANNER_TERM_NAME.exec(plain);
  return match ? `${match[2]} ${match[1]}` : plain;
}

/**
 * Temple University's Banner term codes: the year, then 03 Spring, 20 Summer
 * I, 26 Summer II, 36 Fall. Used to name and add terms Banner hasn't posted
 * yet in the planner.
 */
export const TEMPLE_SEASONS = [
  { code: "03", name: "Spring" },
  { code: "20", name: "Summer I" },
  { code: "26", name: "Summer II" },
  { code: "36", name: "Fall" },
] as const;
const TERM_CODE = /^(\d{4})(\d{2})$/;

export type TempleSeasonCode = (typeof TEMPLE_SEASONS)[number]["code"];

/** 2027 + "36" → "202736". */
export function templeTermCode(year: number, season: TempleSeasonCode): string {
  return `${year}${season}`;
}

/** The year and season of a Temple code, or null for a code outside the scheme. */
export function splitTempleTerm(
  code: string,
): { year: number; season: TempleSeasonCode } | null {
  const match = TERM_CODE.exec(code);
  const season = TEMPLE_SEASONS.find((s) => s.code === match?.[2]);
  return match && season
    ? { year: Number(match[1]), season: season.code }
    : null;
}

/** "202703" for Banner's "2027 Spring", or null for a name outside Temple's seasons. */
export function templeTermCodeFromName(
  bannerDescription: string,
): string | null {
  const plain = bannerDescription.replace(VIEW_ONLY, " ").trim();
  const match = BANNER_TERM_NAME.exec(plain);
  // Exact names, so "Summer I" never matches "Summer II".
  const season = TEMPLE_SEASONS.find((s) => s.name === match?.[2]);
  return match && season ? templeTermCode(Number(match[1]), season.code) : null;
}

/** "Fall 2027" for "202736", or null for a code outside Temple's scheme. */
export function templeTermName(code: string): string | null {
  const term = splitTempleTerm(code);
  const season = TEMPLE_SEASONS.find((s) => s.code === term?.season);
  return term && season ? `${season.name} ${term.year}` : null;
}

/** The next `count` terms after `code`, summers included, as Temple codes. */
export function nextTerms(code: string, count: number): string[] {
  const match = TERM_CODE.exec(code);
  if (!match) return [];
  let year = Number(match[1]);
  let index = TEMPLE_SEASONS.findIndex((s) => s.code === match[2]);
  if (index === -1) return [];
  const terms: string[] = [];
  while (terms.length < count) {
    index++;
    if (index === TEMPLE_SEASONS.length) {
      index = 0;
      year++;
    }
    terms.push(`${year}${TEMPLE_SEASONS[index]!.code}`);
  }
  return terms;
}
