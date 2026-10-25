"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { dragOf, termOf, type CourseDrag } from "./course-drag";

/** A click on a row's buttons moves the pointer a little; only a real move starts a drag. */
const MOUSE_DRAG_DISTANCE = 5;
/** A touch has to rest this long before it drags, so the page still scrolls under a finger. */
const TOUCH_DRAG_DELAY_MS = 250;
const TOUCH_DRAG_TOLERANCE = 5;

/**
 * The term under the pointer; a keyboard drag has no pointer, so there it's
 * the term the moved course overlaps most.
 */
const termUnderDrag: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "To pick up a course, press space or enter. Use the arrow keys to move it over a term, then press space or enter to drop it there, or escape to cancel.",
};

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Picked up ${dragOf(active)?.label}.`,
  onDragOver: ({ active, over }) => {
    const term = termOf(over);
    return term
      ? `${dragOf(active)?.label} is over ${term.name}.`
      : `${dragOf(active)?.label} is not over a term.`;
  },
  onDragEnd: ({ active, over }) => {
    const term = termOf(over);
    return term
      ? `Dropped ${dragOf(active)?.label} on ${term.name}.`
      : `${dragOf(active)?.label} was not dropped on a term.`;
  },
  onDragCancel: ({ active }) =>
    `Stopped moving ${dragOf(active)?.label}. It stays where it was.`,
};

interface PlannerDndProps {
  /** A course dropped on a term that takes courses. */
  onDrop: (term: string, drag: CourseDrag) => void;
  children: ReactNode;
}

/** Drag and drop for the planner: side panel courses and term entries onto terms. */
export function PlannerDnd({ onDrop, children }: PlannerDndProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: MOUSE_DRAG_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_DRAG_DELAY_MS,
        tolerance: TOUCH_DRAG_TOLERANCE,
      },
    }),
    useSensor(KeyboardSensor),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={termUnderDrag}
      accessibility={{
        announcements: ANNOUNCEMENTS,
        screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
      }}
      onDragStart={({ active }) => setDragging(dragOf(active)?.label ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={({ active, over }) => {
        setDragging(null);
        const drag = dragOf(active);
        const term = termOf(over);
        if (drag && term) onDrop(term.term, drag.drag);
      }}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          // The course lands where it's dropped, so it doesn't fly back first.
          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="w-fit cursor-grabbing rounded-xl bg-card px-3 py-2 font-medium shadow-lg ring-1 ring-border">
                {dragging}
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}
