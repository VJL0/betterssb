import {
  CircleCheckIcon,
  GraduationCapIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { CreditTotals } from "@workspace/shared/lib/dars";
import { formatCredits } from "@workspace/shared/lib/dars";
import type { ProjectedFinish } from "@workspace/shared/lib/planner";
import { isPageReady } from "@/app/pages";
import { Card } from "@workspace/ui/components/card";
import { ButtonLink } from "@/components/button-link";

// Planned credits are striped: counted toward the degree, but not taken yet.
const PLANNED_FILL =
  "bg-[image:repeating-linear-gradient(135deg,color-mix(in_oklch,var(--primary)_35%,transparent)_0_4px,color-mix(in_oklch,var(--primary)_15%,transparent)_4px_8px)]";

const CARD_CLASS = "flex-row flex-wrap items-center gap-6 p-5";

interface DegreeProgressProps {
  totals: CreditTotals;
  finish: ProjectedFinish;
  /** Credits of requirements without a term yet. */
  unplaced: number;
}

function share(credits: number, total: number): string {
  return `${Math.min(credits / total, 1) * 100}%`;
}

/** W2.3 summary: credits toward the degree, from the stored audit plus the plan. */
export function DegreeProgress({
  totals,
  finish,
  unplaced,
}: DegreeProgressProps) {
  const { counted, onTrack, shortBy: short, lastTerm: lastTermName } = finish;
  const planned = counted - totals.earned - totals.inProgress;
  const legend = [
    { label: "Completed", value: totals.earned, swatch: "bg-primary" },
    { label: "In progress", value: totals.inProgress, swatch: "bg-primary/55" },
    { label: "Planned", value: planned, swatch: PLANNED_FILL },
    {
      label: "Unplaced",
      value: unplaced,
      swatch: "bg-muted ring-1 ring-border ring-inset",
    },
  ];

  return (
    <Card
      render={<section />}
      aria-label="Degree progress"
      className={CARD_CLASS}
    >
      <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">
            Toward {formatCredits(totals.total)} credits
          </span>
          <span className="tabular-nums">
            <span className="text-lg font-medium">
              {formatCredits(counted)}
            </span>
            <span className="text-muted-foreground"> counted</span>
          </span>
        </div>
        <div
          role="img"
          aria-label={`${formatCredits(totals.earned)} completed, ${formatCredits(totals.inProgress)} in progress, ${formatCredits(planned)} planned of ${formatCredits(totals.total)} credits`}
          className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="bg-primary"
            style={{ width: share(totals.earned, totals.total) }}
          />
          <span
            className="bg-primary/55"
            style={{ width: share(totals.inProgress, totals.total) }}
          />
          <span
            className={PLANNED_FILL}
            style={{ width: share(planned, totals.total) }}
          />
        </div>
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground tabular-nums">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`size-2.5 rounded-[3px] ${item.swatch}`}
              />
              {item.label} {formatCredits(item.value)}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-[1_1_16rem] items-center gap-3 rounded-2xl bg-sidebar px-4 py-3 ring-1 ring-border ring-inset">
        <span
          className={
            onTrack
              ? "grid size-9 place-items-center rounded-xl bg-success/10 text-success"
              : "grid size-9 place-items-center rounded-xl bg-warning/10 text-warning"
          }
        >
          {onTrack ? (
            <CircleCheckIcon aria-hidden className="size-4" />
          ) : (
            <TriangleAlertIcon aria-hidden className="size-4" />
          )}
        </span>
        <span className="flex flex-col">
          <span className="font-medium">
            {onTrack
              ? lastTermName
                ? `On track to finish in ${lastTermName}`
                : "On track"
              : `${formatCredits(short)} more credits to plan`}
          </span>
          <span className="text-xs text-muted-foreground">
            {onTrack
              ? "Your plan covers every credit the audit needs."
              : "Place the remaining requirements or add a term."}
          </span>
        </span>
      </div>
    </Card>
  );
}

/** Shown until an audit is saved on this device. */
export function NoAuditProgress() {
  return (
    <Card
      render={<section />}
      aria-label="Degree progress"
      className={CARD_CLASS}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-muted">
        <GraduationCapIcon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">
          See your progress toward your degree
        </span>
        <span className="text-muted-foreground">
          Run your degree audit and its credits and remaining requirements show
          up here, next to your plan.
        </span>
      </span>
      {isPageReady("audit") && (
        <ButtonLink to="/audit" variant="outline">
          Open degree audit
        </ButtonLink>
      )}
    </Card>
  );
}
