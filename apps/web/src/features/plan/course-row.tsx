"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useCourseDrag, type NewCourse } from "./course-drag";
import { DragHandle } from "./drag-handle";

interface CourseRowProps {
  course: NewCourse;
  /** What the row is called when it isn't the course's code, such as a requirement's title. */
  name?: string;
  /** The line under the name: a course's title, or a requirement's options. */
  subtitle?: string;
  /** "3 cr" or "1-4 cr". */
  credits: string | null;
  /** Where the course already is, such as "In Fall 2027" or "On your audit". */
  status: string | null;
  /** The term the add button adds to; null leaves it disabled. */
  targetName: string | null;
  onAdd: () => void;
  /** A description to show when the row is opened. */
  details?: ReactNode;
}

/** A course in the side panel: drag it onto a term, or add it to the chosen one. */
export function CourseRow({
  course,
  name = course.code ?? course.title,
  subtitle,
  credits,
  status,
  targetName,
  onAdd,
  details,
}: CourseRowProps) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } =
    useCourseDrag({ kind: "course", course }, name);

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group/drag flex flex-col rounded-xl hover:bg-muted",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex min-h-11 items-center gap-2 px-1.5 py-1.5">
        <DragHandle
          setActivatorNodeRef={setActivatorNodeRef}
          attributes={attributes}
          label={`Move ${name} to a term`}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{name}</span>
            {credits && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {credits}
              </span>
            )}
          </span>
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
          {status && (
            <span className="pt-1">
              <Badge variant="secondary">{status}</Badge>
            </span>
          )}
        </span>
        {details && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`About ${name}`}
            onClick={() => setOpen(!open)}
          >
            <ChevronDownIcon className={cn(open && "rotate-180")} />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon-xs"
          disabled={!targetName}
          aria-label={`Add ${name} to ${targetName ?? "a term"}`}
          onClick={onAdd}
        >
          <PlusIcon />
        </Button>
      </div>
      {details && open && (
        <div
          id={detailsId}
          className="flex flex-col gap-1.5 px-7 pb-2.5 text-xs text-muted-foreground"
        >
          {details}
        </div>
      )}
    </li>
  );
}
