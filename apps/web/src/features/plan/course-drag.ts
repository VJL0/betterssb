import type { DragEvent } from "react";
import type { PlannedCourse } from "@workspace/shared/types/store";

/** Only the planner's own drags carry this type, so dropped text or files are ignored. */
const COURSE_DRAG_TYPE = "application/x-betterssb-course";

/** A course to plan, before it has an id. */
export type NewCourse = Pick<
  PlannedCourse,
  "code" | "title" | "credits" | "requirement"
>;

/** A course from the side panel, or one already in a term being moved to another. */
export type CourseDrag =
  | { kind: "course"; course: NewCourse }
  | { kind: "entry"; term: string; key: string };

export function startCourseDrag(
  event: DragEvent,
  drag: CourseDrag,
  label: string,
): void {
  event.dataTransfer.setData(COURSE_DRAG_TYPE, JSON.stringify(drag));
  event.dataTransfer.setData("text/plain", label);
  event.dataTransfer.effectAllowed = drag.kind === "entry" ? "move" : "copy";
}

/** Whether a drag holds a course. Its data can only be read on drop. */
export function isCourseDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(COURSE_DRAG_TYPE);
}

export function readCourseDrag(event: DragEvent): CourseDrag | null {
  const data = event.dataTransfer.getData(COURSE_DRAG_TYPE);
  if (!data) return null;
  try {
    return JSON.parse(data) as CourseDrag;
  } catch {
    return null;
  }
}
