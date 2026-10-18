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
