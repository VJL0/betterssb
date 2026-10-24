import { useId, useState } from "react";
import { ChevronDownIcon, CircleXIcon } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  describeMeetings,
  planCourseColor,
  planCredits,
  type PlanClash,
} from "@workspace/shared/lib/plan";
import { formatTermName } from "@workspace/shared/lib/terms";
import type { TermPlan } from "@workspace/shared/types/store";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { LogoMark } from "@workspace/ui/components/logo";
import { courseBackgroundClass } from "@workspace/ui/lib/course-color-classes";
import { WEB_ORIGIN } from "@/lib/config";
import { clashSummary } from "./row-overlay";

/** A section on this Banner page that overlaps the plan. */
export interface PageClash {
  crn: string;
  label: string;
  clashes: readonly PlanClash[];
}

/** "Spring plan", as on the board: the page already says which year. */
function planTitle(plan: TermPlan): string {
  return `${formatTermName(plan.termDescription).replace(/\s+\d{4}$/, "")} plan`;
}

function conflictCount(count: number): string {
  return `${count} ${count === 1 ? "conflict" : "conflicts"}`;
}

/**
 * E3.1 plan dock: the term's plan and this page's conflicts, in a corner.
 * Starts collapsed so it never covers Banner's own controls until asked.
 */
export function PlanDock({
  plan,
  pageClashes,
}: {
  plan: TermPlan;
  pageClashes: readonly PageClash[];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <Card
      render={<aside />}
      aria-label="BetterSSB plan"
      className="fixed right-6 bottom-6 z-50 w-80 max-w-[calc(100vw-3rem)] gap-0 py-0 font-sans shadow-lg ring-foreground/10"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <LogoMark className="h-2.5 w-5.5" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {planTitle(plan)} · {planCredits(plan)} cr
        </span>
        {pageClashes.length > 0 && (
          <Badge variant="destructive">
            {conflictCount(pageClashes.length)}
          </Badge>
        )}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto border-t px-2 pb-2"
      >
        <ul className="flex flex-col gap-0.5 pt-1">
          {plan.sections.map((section) => {
            const color = planCourseColor(plan, section.courseId);
            return (
              <li
                key={section.crn}
                className="flex items-center gap-2.5 rounded-2xl p-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-7 w-1 shrink-0 rounded-full",
                    color ? courseBackgroundClass(color) : "bg-muted",
                  )}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">
                    {section.courseCode} · {section.section}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {describeMeetings(section)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        {pageClashes.map((page) => (
          <p
            key={page.crn}
            className="mx-2 my-1 flex gap-2 rounded-2xl border px-3 py-2.5 text-sm text-destructive"
          >
            <CircleXIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {page.label} on this page overlaps{" "}
              {page.clashes.map(clashSummary).join("; ")}.
            </span>
          </p>
        ))}
        <a
          href={`${WEB_ORIGIN}/plan`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "sm" }), "mx-2 my-1")}
        >
          Open in BetterSSB
        </a>
      </div>
    </Card>
  );
}
