import { PlusIcon, XIcon } from "lucide-react";
import { planCourseColor } from "@workspace/shared/lib/plan";
import {
  APPROVAL_ABOVE,
  PART_TIME_BELOW,
  entryCredits,
  termEntries,
  type TermEntry,
} from "@workspace/shared/lib/planner";
import { formatCredits } from "@workspace/shared/lib/dars";
import type { TermPlan } from "@workspace/shared/types/store";
import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { courseBackgroundClass } from "@workspace/ui/lib/course-color-classes";
import { cn } from "@workspace/ui/lib/utils";

export type TermStatus = "posted" | "past" | "planned";

const STATUS_BADGE = {
  posted: { label: "Schedule posted", variant: "info" },
  past: { label: "Past term", variant: "secondary" },
  planned: { label: "Planned", variant: "outline" },
} as const satisfies Record<TermStatus, { label: string; variant: string }>;

interface TermCardProps {
  plan: TermPlan;
  status: TermStatus;
  isTarget: boolean;
  /** Absent when there's nothing to add to a term. */
  onTarget?: () => void;
  onRemove: (entry: TermEntry) => void;
  /** A requirement's title by its audit code. */
  requirementTitle: (code: string) => string | null;
}

function loadNote(
  credits: number,
  courseCount: number,
): { text: string; className: string } {
  if (credits > APPROVAL_ABOVE) {
    return {
      text: `Over ${APPROVAL_ABOVE} cr needs approval`,
      className: "text-destructive",
    };
  }
  if (courseCount === 0) {
    return { text: "Nothing planned yet", className: "text-muted-foreground" };
  }
  if (credits > 0 && credits < PART_TIME_BELOW) {
    return {
      text: `Under ${PART_TIME_BELOW} cr is part-time`,
      className: "text-warning",
    };
  }
  return { text: "", className: "" };
}

/** One term in the planner: its courses, credit load and an add target. */
export function TermCard({
  plan,
  status,
  isTarget,
  onTarget,
  onRemove,
  requirementTitle,
}: TermCardProps) {
  const name = plan.termDescription;
  const entries = termEntries(plan);
  const credits = entryCredits(entries);
  const note = loadNote(credits, entries.length);
  const badge = STATUS_BADGE[status];
  const editable = status !== "past";

  return (
    <Card
      render={<article />}
      aria-label={name}
      className={cn(
        "gap-2.5 pt-4 pb-3",
        isTarget && onTarget && "ring-2 ring-primary",
      )}
    >
      <header className="flex flex-col gap-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">{name}</h2>
          <span
            className={cn(
              "font-medium tabular-nums",
              credits > APPROVAL_ABOVE && "text-destructive",
            )}
          >
            {formatCredits(credits)} cr
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {note.text && (
            <span className={cn("text-xs", note.className)}>{note.text}</span>
          )}
        </div>
      </header>

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1.5 px-2">
          {entries.map((entry) => {
            const color = entry.code ? planCourseColor(plan, entry.key) : null;
            const requirementName = entry.requirement
              ? requirementTitle(entry.requirement)
              : null;
            // A placeholder is named after its requirement; don't say it twice.
            const requirement =
              requirementName !== entry.title ? requirementName : null;
            return (
              <li
                key={entry.key}
                className="flex items-start gap-2.5 rounded-2xl p-2.5 ring-1 ring-border ring-inset"
              >
                <span
                  aria-hidden
                  className={cn(
                    "w-1 self-stretch rounded-full",
                    color
                      ? courseBackgroundClass(color)
                      : "bg-muted-foreground/30",
                  )}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex justify-between gap-2">
                    <span className="font-medium">
                      {entry.code ?? entry.title}
                    </span>
                    {entry.credits !== null && (
                      <span className="text-muted-foreground tabular-nums">
                        {formatCredits(entry.credits)} cr
                      </span>
                    )}
                  </span>
                  {entry.code && (
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {entry.title}
                    </span>
                  )}
                  {requirement && (
                    <span className="flex flex-wrap gap-1">
                      <Badge
                        variant="secondary"
                        className="h-auto max-w-full py-0.5 whitespace-normal"
                      >
                        {requirement}
                      </Badge>
                    </span>
                  )}
                </span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${entry.code ?? entry.title} from ${name}`}
                    onClick={() => onRemove(entry)}
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && onTarget && (
        <Button
          variant="outline"
          aria-pressed={isTarget}
          onClick={onTarget}
          className={cn(
            "mx-2 border-dashed",
            isTarget
              ? "border-ring bg-muted text-foreground"
              : "text-muted-foreground",
          )}
        >
          <PlusIcon data-icon="inline-start" />
          {isTarget ? "Adding here" : `Add to ${name}`}
        </Button>
      )}
    </Card>
  );
}
