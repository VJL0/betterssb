"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, CircleXIcon, PlusIcon } from "lucide-react";
import { bulletinYearFor } from "@workspace/shared/lib/bulletin";
import { creditTotals, neededRequirements } from "@workspace/shared/lib/dars";
import {
  courseKey,
  emptyPlan,
  splitCourseCode,
} from "@workspace/shared/lib/plan";
import {
  auditCourseKeys,
  placedRequirements,
  projectedFinish,
  termEntries,
} from "@workspace/shared/lib/planner";
import { nextTerms, templeTermName } from "@workspace/shared/lib/terms";
import type { TermPlan } from "@workspace/shared/types/store";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { usePlans } from "@/hooks/use-plans";
import { useSettings } from "@/hooks/use-settings";
import { useTerms } from "@/hooks/use-terms";
import { useStoreDocument } from "@/lib/store/store-context";
import type { CourseDrag } from "./course-drag";
import { CoursePanel } from "./course-panel";
import { DegreeProgress, NoAuditProgress } from "./degree-progress";
import { PlannerDnd } from "./planner-dnd";
import { TermCard, type TermStatus } from "./term-card";
import { TermDialog } from "./term-dialog";
import { usePlanEdits } from "./use-plan-edits";

/** How many upcoming terms "Add term" offers. */
const TERMS_OFFERED = 4;

function auditDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

/** The current term's plan stays on screen even before anything is in it. */
function withCurrentTerm(
  plans: readonly TermPlan[],
  current: { code: string; name: string } | null,
): TermPlan[] {
  if (!current || plans.some((p) => p.term === current.code)) {
    return [...plans];
  }
  return [...plans, emptyPlan(current.code, current.name)].sort((a, b) =>
    a.term.localeCompare(b.term),
  );
}

/** The subject most of these course codes are in, which the catalog opens with. */
function mostCommonSubject(codes: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const subject = splitCourseCode(code)?.subject;
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [subject, count] of counts) {
    if (best === null || count > counts.get(best)!) best = subject;
  }
  return best;
}

/** Each planned course's first term, by course key. */
function plannedTerms(plans: readonly TermPlan[]): Map<string, string> {
  const terms = new Map<string, string>();
  for (const plan of plans) {
    for (const entry of termEntries(plan)) {
      if (entry.code && !terms.has(entry.key)) {
        terms.set(entry.key, plan.termDescription);
      }
    }
  }
  return terms;
}

/** W2.3 · Semester planner: terms ahead, checked against the saved audit. */
export function PlanPage() {
  const { term: currentTerm } = useCurrentTerm();
  const { plans: savedPlans, status, save, remove } = usePlans();
  const { settings } = useSettings();
  const stored = useStoreDocument("audit");
  const posted = useTerms();
  const [targetTerm, setTargetTerm] = useState<string | null>(null);
  const [termDialog, setTermDialog] = useState<{
    open: boolean;
    editing: TermPlan | null;
  }>({ open: false, editing: null });

  const plans = useMemo(
    () => withCurrentTerm(savedPlans, currentTerm),
    [savedPlans, currentTerm],
  );
  const audit = stored.value?.audit ?? null;
  const totals = audit ? creditTotals(audit) : null;
  const needed = useMemo(
    () => (audit ? neededRequirements(audit) : []),
    [audit],
  );
  const placed = placedRequirements(plans);
  const unplaced = needed.filter((r) => !placed.has(r.code));
  const counted = useMemo(
    () => (audit ? auditCourseKeys(audit) : new Set<string>()),
    [audit],
  );
  const edits = usePlanEdits({ plans, save, remove });
  const planned = useMemo(() => plannedTerms(plans), [plans]);
  const bulletinYear = bulletinYearFor(
    {
      programYear: settings.program?.bulletinYear ?? null,
      startTerm: settings.startTerm,
      auditCatalogYear: audit?.catalogYear ?? null,
    },
    new Date(),
  );
  const initialSubject = mostCommonSubject([
    ...plans.flatMap((p) => termEntries(p).flatMap((e) => e.code ?? [])),
    ...needed.flatMap((r) => r.options),
  ]);

  const postedCodes = new Set(posted.terms.map((t) => t.code));
  const earliestPosted = posted.terms.map((t) => t.code).sort()[0];
  const termStatus = (code: string): TermStatus =>
    postedCodes.has(code)
      ? "posted"
      : earliestPosted && code < earliestPosted
        ? "past"
        : "planned";

  const editable = plans.filter((p) => termStatus(p.term) !== "past");
  const target =
    editable.find((p) => p.term === targetTerm) ?? editable.at(-1) ?? null;
  const latestCode = plans.at(-1)?.term ?? currentTerm?.code ?? null;
  const upcoming = latestCode
    ? nextTerms(latestCode, TERMS_OFFERED).flatMap((code) => {
        const name = templeTermName(code);
        return name ? [{ code, name }] : [];
      })
    : [];

  const statusOf = (code: string): string | null => {
    const key = courseKey(code);
    const term = planned.get(key);
    if (term) return `In ${term}`;
    return counted.has(key) ? "On your audit" : null;
  };

  function openTermDialog(editing: TermPlan | null) {
    setTermDialog({ open: true, editing });
  }

  async function submitTerm(code: string, name: string) {
    const { editing } = termDialog;
    setTermDialog({ open: false, editing });
    if (editing) {
      edits.changeTerm(editing, code, name);
      setTargetTerm(code);
    } else if (await edits.addTerm(code, name)) {
      setTargetTerm(code);
    }
  }

  /** The current term always shows, so removing it only empties it. */
  function deleteAction(plan: TermPlan) {
    const saved = savedPlans.some((p) => p.term === plan.term);
    if (!saved) return null;
    const isCurrent = plan.term === currentTerm?.code;
    return {
      label: isCurrent ? "Clear term" : "Remove term",
      run: () =>
        edits.deleteTerm(
          plan,
          `${isCurrent ? "Cleared" : "Removed"} ${plan.termDescription}`,
        ),
    };
  }

  function dropOn(term: string, drag: CourseDrag) {
    const plan = plans.find((p) => p.term === term);
    if (plan) edits.drop(plan, drag);
  }

  const requirementTitle = (code: string) =>
    audit?.requirements.find((r) => r.code === code)?.title || null;

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Semester planner
          </h1>
          <p className="text-muted-foreground">
            {audit && stored.value
              ? [
                  audit.programTitle,
                  audit.catalogYear && `${audit.catalogYear} bulletin`,
                  `from your ${auditDate(stored.value.storedAt)} audit`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Lay out your terms ahead. Everything stays on this device."}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            <PlusIcon data-icon="inline-start" />
            Add term
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {upcoming
              .filter((t) => !plans.some((p) => p.term === t.code))
              .map((t) => (
                <DropdownMenuItem
                  key={t.code}
                  onClick={() => void submitTerm(t.code, t.name)}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
            {upcoming.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => openTermDialog(null)}>
              Another term…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TermDialog
        open={termDialog.open}
        onOpenChange={(open) => setTermDialog({ ...termDialog, open })}
        editing={
          termDialog.editing && {
            code: termDialog.editing.term,
            name: termDialog.editing.termDescription,
            hasSections: termDialog.editing.sections.length > 0,
          }
        }
        taken={new Set(plans.map((p) => p.term))}
        onSubmit={(code, name) => void submitTerm(code, name)}
      />

      {status === "error" ? (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Couldn't open your saved plans</AlertTitle>
          <AlertDescription>
            Reload the page. If it keeps happening, your browser may be blocking
            site storage.
          </AlertDescription>
        </Alert>
      ) : status === "loading" || stored.status === "loading" ? (
        <div role="status" className="flex flex-col gap-5">
          <span className="sr-only">Loading your plans…</span>
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      ) : (
        <>
          {totals ? (
            <DegreeProgress
              totals={totals}
              finish={projectedFinish(totals, plans, counted)}
              unplaced={unplaced.reduce((sum, r) => sum + (r.credits ?? 0), 0)}
            />
          ) : (
            // An audit without degree totals still fills "Still needed".
            !audit && <NoAuditProgress />
          )}

          <PlannerDnd onDrop={dropOn}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section
                aria-label="Terms"
                className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4"
              >
                {plans.map((plan) => (
                  <TermCard
                    key={plan.term}
                    plan={plan}
                    status={termStatus(plan.term)}
                    isTarget={plan.term === target?.term}
                    onTarget={() => setTargetTerm(plan.term)}
                    onRemove={(entry) => edits.removeCourse(plan, entry)}
                    onEdit={() => openTermDialog(plan)}
                    onDelete={deleteAction(plan)}
                    requirementTitle={requirementTitle}
                  />
                ))}
                {plans.length === 0 && (
                  <p className="col-span-full rounded-3xl border border-dashed p-8 text-center text-muted-foreground">
                    No terms yet. Add one to start planning.
                  </p>
                )}
              </section>
              <CoursePanel
                needed={
                  audit
                    ? { requirements: unplaced, anyNeeded: needed.length > 0 }
                    : null
                }
                programUrl={settings.program?.url ?? null}
                bulletinYear={bulletinYear}
                initialSubject={initialSubject}
                statusOf={statusOf}
                targetName={target?.termDescription ?? null}
                onAdd={(course) => target && edits.addCourse(target, course)}
              />
            </div>
          </PlannerDnd>
        </>
      )}
    </div>
  );
}
