/** The design system has eight course colors, --course-1 to --course-8. */
export const COURSE_COLOR_COUNT = 8;

export interface CourseColor {
  /** 1–8, matching the --course-n token. */
  slot: number;
  /** Courses past the eighth reuse a color with a diagonal hatch. */
  hatched: boolean;
}

/** Color for the course at `order` (0-based) in a term's cart. */
export function courseColor(order: number): CourseColor {
  const index = Math.max(0, Math.floor(order));
  return {
    slot: (index % COURSE_COLOR_COUNT) + 1,
    hatched: index >= COURSE_COLOR_COUNT,
  };
}

/**
 * Gives each course a stable color order. Courses already in `saved` keep
 * theirs, so colors never shuffle when the cart changes; new courses take the
 * next unused order, in cart order. Save the result with the plan.
 */
export function assignCourseColorOrder(
  courseIds: readonly string[],
  saved: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const result: Record<string, number> = {};
  const used = new Set<number>();
  for (const id of courseIds) {
    const order = saved[id];
    if (order !== undefined && !used.has(order)) {
      result[id] = order;
      used.add(order);
    }
  }
  let next = 0;
  for (const id of courseIds) {
    if (id in result) continue;
    while (used.has(next)) next++;
    result[id] = next;
    used.add(next);
  }
  return result;
}
