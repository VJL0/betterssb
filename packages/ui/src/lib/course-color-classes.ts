import type { CourseColor } from "@workspace/shared/lib/course-colors";

// Written out in full so Tailwind generates each class.
const COURSE_BG = [
  "bg-course-1",
  "bg-course-2",
  "bg-course-3",
  "bg-course-4",
  "bg-course-5",
  "bg-course-6",
  "bg-course-7",
  "bg-course-8",
] as const;

/** Diagonal stripes over the fill, for courses past the eighth. */
export const COURSE_HATCH_CLASS =
  "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.18)_6px_8px)]";

/** Background class for a course's solid color. */
export function courseBackgroundClass(color: CourseColor): string {
  return COURSE_BG[color.slot - 1] ?? COURSE_BG[0];
}

/** The CSS variable for a course color, for styles Tailwind can't express statically. */
export function courseColorVar(color: CourseColor): string {
  return `var(--course-${color.slot})`;
}
