import {
  useDraggable,
  useDroppable,
  type Active,
  type Over,
} from "@dnd-kit/core";
import { useId } from "react";
import type { PlannedCourse } from "@workspace/shared/types/store";

/** A course to plan, before it has an id. */
export type NewCourse = Pick<
  PlannedCourse,
  "code" | "title" | "credits" | "requirement"
>;

/** A course from the side panel, or one already in a term being moved to another. */
export type CourseDrag =
  | { kind: "course"; course: NewCourse }
  | { kind: "entry"; term: string; key: string };

/** What a draggable course carries for the drop and for announcements. */
interface CourseDragData {
  drag: CourseDrag;
  /** "CIS 3296", or a requirement's title. */
  label: string;
}

/** What a term carries as a drop target. */
interface TermDropData {
  term: string;
  name: string;
}

/** A draggable course: the row is its node, a grip button its keyboard handle. */
export function useCourseDrag(
  drag: CourseDrag,
  label: string,
  disabled = false,
) {
  // The same course can be in the panel and in a term at once, so ids are per row.
  const id = useId();
  const data: CourseDragData = { drag, label };
  return useDraggable({ id, data, disabled });
}

/** A term as a drop target; terms that can't take courses don't accept drops. */
export function useTermDrop(term: string, name: string, disabled: boolean) {
  const data: TermDropData = { term, name };
  return useDroppable({ id: `term:${term}`, data, disabled });
}

export function dragOf(active: Active): CourseDragData | null {
  return (active.data.current as CourseDragData | undefined) ?? null;
}

export function termOf(over: Over | null): TermDropData | null {
  return (over?.data.current as TermDropData | undefined) ?? null;
}
