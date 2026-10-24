"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon, CircleXIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  creditTotals,
  neededRequirements,
  type NeededRequirement,
} from "@workspace/shared/lib/dars";
import {
  addCourse,
  emptyPlan,
  splitCourseCode,
} from "@workspace/shared/lib/plan";
import {
  auditCourseKeys,
  placedRequirements,
  projectedFinish,
  removeEntry,
  type TermEntry,
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
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { usePlans } from "@/hooks/use-plans";
import { useTerms } from "@/hooks/use-terms";
import { useStoreDocument } from "@/lib/store/store-context";
import { undoToast } from "@/lib/undo-toast";
import { DegreeProgress, NoAuditProgress } from "./degree-progress";
import { StillNeeded } from "./still-needed";
import { TermCard, type TermStatus } from "./term-card";

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

/** The course a requirement adds: its one course if DARS names exactly one. */
function courseForRequirement(requirement: NeededRequirement) {
  const only =
    requirement.options.length === 1 ? requirement.options[0]! : null;
  const code = only && splitCourseCode(only) ? only : null;
  return {
    id: crypto.randomUUID(),
    code,
    title: requirement.title,
    credits: requirement.credits,
    requirement: requirement.code,
    addedAt: new Date().toISOString(),
  };
}

/** W2.3 · Semester planner: terms ahead, checked against the saved audit. */
export function PlanPage() {
  const { term: currentTerm } = useCurrentTerm();
  const { plans: savedPlans, status, save } = usePlans();
  const stored = useStoreDocument("audit");
  const posted = useTerms();
  const [targetTerm, setTargetTerm] = useState<string | null>(null);

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
  const counted = audit ? auditCourseKeys(audit) : new Set<string>();

  const postedCodes = new Set(posted.terms.map((t) => t.code));
  const earliestPosted = posted.terms.map((t) => t.code).sort()[0];
  const statusOf = (code: string): TermStatus =>
    postedCodes.has(code)
      ? "posted"
      : earliestPosted && code < earliestPosted
        ? "past"
        : "planned";

  const editable = plans.filter((p) => statusOf(p.term) !== "past");
  const target =
    editable.find((p) => p.term === targetTerm) ?? editable.at(-1) ?? null;
  const latestCode = plans.at(-1)?.term ?? currentTerm?.code ?? null;
  const upcoming = latestCode
    ? nextTerms(latestCode, TERMS_OFFERED).flatMap((code) => {
        const name = templeTermName(code);
        return name ? [{ code, name }] : [];
      })
    : [];

  async function update(before: TermPlan, after: TermPlan, message: string) {
    try {
      await save(after);
      undoToast(message, () => void save(before));
    } catch {
      toast.error("Couldn't save your plan. Try again.");
    }
  }

  function remove(plan: TermPlan, entry: TermEntry) {
    void update(
      plan,
      removeEntry(plan, entry.key, new Date().toISOString()),
      `Removed ${entry.code ?? entry.title} from ${plan.termDescription}`,
    );
  }

  function addRequirement(requirement: NeededRequirement) {
    if (!target) return;
    void update(
      target,
      addCourse(
        target,
        courseForRequirement(requirement),
        new Date().toISOString(),
      ),
      `Added ${requirement.title} to ${target.termDescription}`,
    );
  }

  async function addTerm(code: string, name: string) {
    try {
      await save(emptyPlan(code, name));
      setTargetTerm(code);
      toast.success(`Added ${name}`);
    } catch {
      toast.error("Couldn't add the term. Try again.");
    }
  }

  const requirementTitle = (code: string) =>
    audit?.requirements.find((r) => r.code === code)?.title || null;

  return (
    <div className="mx-auto flex max-w-page flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
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
        {upcoming.length > 0 && (
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
                    onClick={() => void addTerm(t.code, t.name)}
                  >
                    {t.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <section
              aria-label="Terms"
              className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] items-start gap-4"
            >
              {plans.map((plan) => (
                <TermCard
                  key={plan.term}
                  plan={plan}
                  status={statusOf(plan.term)}
                  isTarget={plan.term === target?.term}
                  onTarget={
                    unplaced.length > 0
                      ? () => setTargetTerm(plan.term)
                      : undefined
                  }
                  onRemove={(entry) => remove(plan, entry)}
                  requirementTitle={requirementTitle}
                />
              ))}
            </section>
            {audit && (
              <StillNeeded
                requirements={unplaced}
                anyNeeded={needed.length > 0}
                targetName={target?.termDescription ?? null}
                onAdd={addRequirement}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
