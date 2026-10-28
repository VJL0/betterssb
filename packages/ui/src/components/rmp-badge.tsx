import { cn } from "cn";
import { HourglassIcon } from "lucide-react";
import { instructorSearchName } from "@workspace/shared/lib/instructors";
import {
  formatRating,
  ratingBand,
  rmpSearchUrl,
  type RatingBand,
} from "@workspace/shared/lib/ratings";

import { Badge, badgeVariants } from "@workspace/ui/components/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card";
import type { RmpRating } from "@workspace/api-client";

// High isn't "default": the primary color is Temple Cherry, which would read as the low band's red.
const BAND_VARIANT = {
  high: "success",
  mid: "secondary",
  low: "destructive",
  none: "outline",
} as const satisfies Record<RatingBand, string>;

interface RmpBadgeProps {
  /** Null when the instructor has no Rate My Professors profile. */
  rating: RmpRating | null;
  /** Banner's name for the instructor ("Last, First M."); without a profile, the badge searches RMP for it. */
  instructorName?: string;
  /** Adds "· 88%" (would take again) to the badge. */
  showWouldTakeAgain?: boolean;
  /** Just the score ("4.2", or "No RMP"), for Banner's narrow table cells. */
  compact?: boolean;
  /** Where the details card renders; inside a shadow root it must stay in that tree. */
  popupContainer?: HTMLElement | ShadowRoot | null;
  className?: string;
}

function badgeText(
  rating: RmpRating,
  showWouldTakeAgain: boolean,
  compact: boolean,
): string {
  if (compact) return formatRating(rating.overallRating);
  const parts = [
    formatRating(rating.overallRating),
    `diff ${formatRating(rating.difficulty)}`,
  ];
  if (showWouldTakeAgain && rating.wouldTakeAgainPct != null) {
    parts.push(`${Math.round(rating.wouldTakeAgainPct)}%`);
  }
  return parts.join(" · ");
}

function initials(name: string): string {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * An instructor's Rate My Professors score, tinted by band. Hovering or
 * focusing it shows the details; activating it opens the RMP profile.
 */
function RmpBadge({
  rating,
  instructorName,
  showWouldTakeAgain = false,
  compact = false,
  popupContainer,
  className,
}: RmpBadgeProps) {
  if (!rating) {
    return (
      <NoProfileBadge
        instructorName={instructorName}
        compact={compact}
        className={className}
      />
    );
  }

  if (rating.numRatings === 0) {
    return (
      <UnratedBadge rating={rating} compact={compact} className={className} />
    );
  }

  const text = badgeText(rating, showWouldTakeAgain, compact);
  const variant = BAND_VARIANT[ratingBand(rating.overallRating)];
  // Without a profile link (sample data, say) there's nothing to open.
  if (!rating.rmpUrl) {
    return (
      <Badge
        data-slot="rmp-badge"
        variant={variant}
        className={cn("tabular-nums", className)}
      >
        {text}
      </Badge>
    );
  }
  return (
    <HoverCard>
      <HoverCardTrigger
        data-slot="rmp-badge"
        href={rating.rmpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(badgeVariants({ variant }), "tabular-nums", className)}
      >
        {text}{" "}
        <span className="sr-only">
          {`rating for ${rating.professorName} on Rate My Professors, opens in a new tab`}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        container={popupContainer}
        className="flex flex-col gap-3"
      >
        <RmpDetails rating={rating} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Stands in for an RmpBadge while ratings are still being fetched for the
 * first time, which can take a minute; a skeleton reads as "any moment now".
 */
function RmpPendingBadge({ className }: { className?: string }) {
  return (
    <Badge
      data-slot="rmp-badge"
      variant="outline"
      className={cn("border-dashed text-muted-foreground", className)}
    >
      <HourglassIcon aria-hidden data-icon="inline-start" />
      Rating loading
      <span className="sr-only"> from Rate My Professors</span>
    </Badge>
  );
}

/**
 * A profile nobody has rated yet. RMP reports its score as 0.0, which would
 * read as terrible, so the badge says so instead and links to the profile.
 */
function UnratedBadge({
  rating,
  compact,
  className,
}: {
  rating: RmpRating;
  compact: boolean;
  className?: string;
}) {
  const text = compact ? "No ratings" : "No ratings yet";
  const classes = cn("border-dashed text-muted-foreground", className);
  if (!rating.rmpUrl) {
    return (
      <Badge data-slot="rmp-badge" variant="outline" className={classes}>
        {text}
      </Badge>
    );
  }
  return (
    <a
      data-slot="rmp-badge"
      href={rating.rmpUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`No ratings yet for ${rating.professorName} on Rate My Professors, opens in a new tab`}
      className={cn(badgeVariants({ variant: "outline" }), classes)}
    >
      {text}
    </a>
  );
}

/** We found no profile, but RMP may list them under another name: link to its search. */
function NoProfileBadge({
  instructorName,
  compact,
  className,
}: {
  instructorName?: string;
  compact: boolean;
  className?: string;
}) {
  const classes = cn("border-dashed text-muted-foreground", className);
  if (!instructorName) {
    return (
      <Badge data-slot="rmp-badge" variant="outline" className={classes}>
        {compact ? "No RMP" : "No RMP profile"}
        {compact && <span className="sr-only"> profile</span>}
      </Badge>
    );
  }
  return (
    <a
      data-slot="rmp-badge"
      href={rmpSearchUrl(instructorName)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`No RMP profile, search Rate My Professors for ${instructorSearchName(instructorName)}, opens in a new tab`}
      className={cn(badgeVariants({ variant: "outline" }), classes)}
    >
      {compact ? "No RMP" : "No RMP profile"}
    </a>
  );
}

function RmpDetails({ rating }: { rating: RmpRating }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs text-foreground/70"
        >
          {initials(rating.professorName)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{rating.professorName}</span>
          <span className="text-xs text-muted-foreground">
            {[rating.department, `${rating.numRatings} ratings`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="ml-auto text-2xl font-medium tabular-nums">
          {formatRating(rating.overallRating)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <RmpStat
          label="Difficulty"
          value={`${formatRating(rating.difficulty)} / 5`}
        />
        {rating.wouldTakeAgainPct != null && (
          <RmpStat
            label="Would take again"
            value={`${Math.round(rating.wouldTakeAgainPct)}%`}
          />
        )}
      </dl>
      {rating.topTags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Top tags">
          {rating.topTags.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary">{tag}</Badge>
            </li>
          ))}
        </ul>
      )}
      <a
        href={rating.rmpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline-offset-4 hover:underline"
      >
        Open on Rate My Professors
      </a>
    </>
  );
}

function RmpStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export { RmpBadge, RmpDetails, RmpPendingBadge };
export type { RmpBadgeProps };
