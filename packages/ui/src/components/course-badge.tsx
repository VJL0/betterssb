import type * as React from "react";
import { cn } from "cn";
import type { CourseColor } from "@workspace/shared/lib/course-colors";

import { Badge } from "@workspace/ui/components/badge";
import {
  COURSE_HATCH_CLASS,
  courseBackgroundClass,
} from "@workspace/ui/lib/course-color-classes";

interface CourseBadgeProps extends Omit<
  React.ComponentProps<typeof Badge>,
  "variant" | "color"
> {
  code: string;
  /** The course's plan color. Without one the course isn't planned yet and shows as an outline. */
  color?: CourseColor | null;
}

/** A course code in its plan color. Course color is identity, never status. */
function CourseBadge({ code, color, className, ...props }: CourseBadgeProps) {
  if (!color) {
    return (
      <Badge
        data-slot="course-badge"
        variant="outline"
        className={cn("tabular-nums", className)}
        {...props}
      >
        {code}
      </Badge>
    );
  }
  return (
    <Badge
      data-slot="course-badge"
      className={cn(
        "text-white tabular-nums",
        courseBackgroundClass(color),
        color.hatched && COURSE_HATCH_CLASS,
        className,
      )}
      {...props}
    >
      {code}
    </Badge>
  );
}

/** The course color alone, for dense lists. Decorative: pair it with the course code. */
function CourseDot({
  color,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "color"> & { color: CourseColor }) {
  return (
    <span
      data-slot="course-dot"
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        courseBackgroundClass(color),
        className,
      )}
      {...props}
    />
  );
}

export { CourseBadge, CourseDot };
