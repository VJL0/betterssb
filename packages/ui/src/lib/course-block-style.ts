import type * as React from "react";
import { cn } from "cn";
import type { CourseColor } from "@workspace/shared/lib/course-colors";
import {
  COURSE_HATCH_CLASS,
  courseBackgroundClass,
  courseColorVar,
} from "@workspace/ui/lib/course-color-classes";

/** What a class block's look depends on. */
export interface BlockLook {
  /** Null for a course that isn't in the plan yet. */
  color: CourseColor | null;
  /** `tint` for labs and recitations: a light course tint with a course-colored ring. */
  appearance?: "solid" | "tint";
  ghost?: boolean;
}

/** Classes for a class block: solid course color, lab tint, ghost or unplanned. */
export function blockAppearance(block: BlockLook): string {
  const base =
    "flex flex-col overflow-hidden rounded-xl px-2.5 py-1.5 text-xs leading-4";
  if (block.ghost) {
    return cn(base, "border-2 border-dashed border-ring bg-background");
  }
  if (!block.color) {
    return cn(base, "bg-muted text-foreground ring-1 ring-border ring-inset");
  }
  if (block.appearance === "tint") {
    return cn(base, "text-foreground ring-2 ring-inset");
  }
  return cn(
    base,
    "text-white",
    courseBackgroundClass(block.color),
    block.color.hatched && COURSE_HATCH_CLASS,
  );
}

/** Tints are computed from the course color, so they're set inline. */
export function blockStyle(block: BlockLook): React.CSSProperties | undefined {
  if (block.ghost || !block.color || block.appearance !== "tint")
    return undefined;
  const color = courseColorVar(block.color);
  return {
    backgroundColor: `oklch(from ${color} 0.93 calc(c * 0.4) h)`,
    ["--tw-ring-color" as string]: color,
  };
}
