import type { DraggableAttributes } from "@dnd-kit/core";
import { GripVerticalIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface DragHandleProps {
  /** dnd-kit's activator ref: keyboard drags start only from this button. */
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  /** "Move CIS 3296". */
  label: string;
  className?: string;
}

/** The grip a course is picked up by with the keyboard; the pointer can grab the whole row. */
export function DragHandle({
  setActivatorNodeRef,
  attributes,
  label,
  className,
}: DragHandleProps) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      aria-label={label}
      className={cn(
        "grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/50 outline-none group-hover/drag:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
        className,
      )}
    >
      <GripVerticalIcon aria-hidden className="size-3.5" />
    </button>
  );
}
