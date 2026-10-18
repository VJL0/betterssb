import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import type { RmpRating } from "@workspace/api-client";
import { instructorSearchName } from "@workspace/shared/lib/instructors";
import { formatClock } from "@workspace/shared/lib/meeting-times";
import type { PlanClash } from "@workspace/shared/lib/plan";
import { usableRating } from "@workspace/shared/lib/ratings";
import { Badge } from "@workspace/ui/components/badge";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { askBackground } from "@/lib/ask-background";
import type { OverlayRow, RatingSlot } from "./row-watcher";

/** "CIS 2168 · 001, TR 9:30" */
export function clashSummary({ planned, overlap }: PlanClash): string {
  return `${planned.courseCode} · ${planned.section}, ${overlap.days.join("")} ${formatClock(overlap.start)}`;
}

function useRating(name: string, schoolId: string | null) {
  return useQuery({
    queryKey: ["rmpRating", schoolId, name],
    queryFn: () =>
      askBackground<RmpRating | null>("FETCH_RATING", {
        name: instructorSearchName(name),
        schoolId,
      }),
    enabled: schoolId !== null,
    // A rating doesn't change while the page is open.
    staleTime: Infinity,
    retry: false,
  });
}

function Rating({
  slot,
  schoolId,
  popupContainer,
}: {
  slot: RatingSlot;
  schoolId: string | null;
  popupContainer: HTMLElement;
}) {
  const rating = useRating(slot.name, schoolId);
  // Nothing while loading or when the lookup fails: Banner's name stands alone.
  if (!rating.isSuccess) return null;
  return createPortal(
    <RmpBadge
      rating={usableRating(rating.data)}
      popupContainer={popupContainer}
      compact
      className="mr-1"
    />,
    slot.container,
  );
}

/** Banner's cells clip overflow; a tag that doesn't fit ends in an ellipsis like Banner's text. */
function Tag({
  variant,
  children,
  detail,
}: {
  variant: "info" | "destructive";
  children: string;
  detail?: string;
}) {
  return (
    <Badge
      variant={variant}
      title={detail ? `${children}: ${detail}` : children}
      className="max-w-full justify-start"
    >
      <span className="truncate">{children}</span>
      {detail && <span className="sr-only">{`: ${detail}`}</span>}
    </Badge>
  );
}

function PlanTags({
  inPlan,
  clashes,
}: {
  inPlan: boolean;
  clashes: readonly PlanClash[];
}) {
  if (!inPlan && clashes.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {inPlan && <Tag variant="info">In your plan</Tag>}
      {clashes.length > 0 && (
        <Tag
          variant="destructive"
          detail={`overlaps ${clashes.map(clashSummary).join("; ")}`}
        >
          Conflicts with your plan
        </Tag>
      )}
    </span>
  );
}

/** What the overlay adds to one section row, each piece in its own cell. */
export function RowOverlay({
  row,
  inPlan,
  clashes,
  schoolId,
  popupContainer,
}: {
  row: OverlayRow;
  inPlan: boolean;
  clashes: readonly PlanClash[];
  schoolId: string | null;
  popupContainer: HTMLElement;
}) {
  return (
    <>
      {row.ratingSlots.map((slot) => (
        <Rating
          key={slot.name}
          slot={slot}
          schoolId={schoolId}
          popupContainer={popupContainer}
        />
      ))}
      {row.seatSlot &&
        row.seats &&
        createPortal(
          // Under Banner's own seat text, never in place of it.
          <div className="@container">
            <SeatMeter
              {...row.seats}
              size="inline"
              // The bar only where the column has room for it beside the word.
              className="[&_[data-slot=progress-track]]:hidden @[7.5rem]:[&_[data-slot=progress-track]]:flex"
            />
          </div>,
          row.seatSlot,
        )}
      {row.tagSlot &&
        createPortal(
          <PlanTags inPlan={inPlan} clashes={clashes} />,
          row.tagSlot,
        )}
    </>
  );
}
