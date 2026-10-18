const MIDDLE_INITIAL = /^[A-Z]\.?$/i;

/**
 * Banner lists instructors as "Last, First M."; Rate My Professors matches
 * "First Last" best. Names without a comma are returned trimmed.
 */
export function instructorSearchName(displayName: string): string {
  const [last, rest] = displayName.split(",", 2).map((part) => part.trim());
  if (!rest || !last) return displayName.trim();
  const first = rest
    .split(/\s+/)
    .filter((part) => !MIDDLE_INITIAL.test(part))
    .join(" ");
  return `${first} ${last}`.trim();
}

/** "Pascucci, Christopher M." → "C. Pascucci", for tight columns. */
export function shortInstructorName(displayName: string): string {
  const [last, rest] = displayName.split(",", 2).map((part) => part.trim());
  if (!rest || !last) return displayName.trim();
  const initial = rest[0]?.toUpperCase();
  return initial ? `${initial}. ${last}` : last;
}

interface NameParts {
  first: string;
  last: string;
}

function normalized(part: string): string {
  return part
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .trim();
}

/** First and last name from "Last, First M." or "First M. Last". */
function nameParts(name: string): NameParts | null {
  const [before, after] = name.split(",", 2);
  const words = (text: string) =>
    normalized(text)
      .split(/\s+/)
      .filter((word) => word.length > 1);
  if (after !== undefined) {
    const first = words(after)[0];
    const last = words(before ?? "").at(-1);
    return first && last ? { first, last } : null;
  }
  const all = words(name);
  return all.length >= 2 ? { first: all[0]!, last: all.at(-1)! } : null;
}

function sameLastName(a: string, b: string): boolean {
  if (a === b) return true;
  // "Smith-Jones" on one side and "Smith" or "Jones" on the other.
  return a.split("-").includes(b) || b.split("-").includes(a);
}

/**
 * Whether a Rate My Professors profile is the Banner instructor. RMP's search
 * is loose ("Cindy Li" finds "Cindy Liao"), so last names must match and
 * first names must agree, allowing short forms ("Chris" for "Christopher").
 */
export function isSameInstructor(bannerName: string, rmpName: string): boolean {
  const banner = nameParts(bannerName);
  const rmp = nameParts(rmpName);
  if (!banner || !rmp || !sameLastName(banner.last, rmp.last)) return false;
  return (
    banner.first.startsWith(rmp.first) || rmp.first.startsWith(banner.first)
  );
}

/** The first search result that is this instructor, or null. */
export function matchingProfile<T extends { professorName: string }>(
  bannerName: string,
  results: readonly T[],
): T | null {
  return (
    results.find((r) => isSameInstructor(bannerName, r.professorName)) ?? null
  );
}
