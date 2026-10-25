"use client";

import { useId, useMemo } from "react";
import { TriangleAlertIcon } from "lucide-react";
import {
  formatCredits,
  type NeededRequirement,
} from "@workspace/shared/lib/dars";
import {
  optimizePlan,
  requirementParts,
  type CatalogCourse,
  type OptimizeResult,
  type OptimizerCourse,
} from "@workspace/shared/lib/plan-optimizer";
import type { PlanPriority, TermPlan } from "@workspace/shared/types/store";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Switch } from "@workspace/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { useCatalogCourses } from "./use-catalog-courses";
import { usePlanPreferences } from "./use-plan-preferences";

/** Full-time is 12 credits; over 18 needs approval at Temple. */
const CREDIT_CHOICES = [12, 13, 14, 15, 16, 17, 18];
const PRIORITIES: { value: PlanPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
  { value: "skip", label: "Skip" },
];

interface OptimizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Requirements the audit still needs and no term has yet. */
  requirements: readonly NeededRequirement[];
  plans: readonly TermPlan[];
  /** The first term that can take courses. */
  firstTerm: string;
  /** Course keys the audit has, taken or in progress. */
  completed: ReadonlySet<string>;
  /** The Bulletin year prerequisites are read from. */
  bulletinYear: string;
  onApply: (result: OptimizeResult) => void;
}

/** W2.3 · Optimize plan: place every still-needed requirement, prerequisites first. */
export function OptimizeSheet({
  open,
  onOpenChange,
  ...props
}: OptimizeSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {/* Mounted only while open, so the Bulletin is read when it's wanted. */}
        {open && <OptimizeForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

/** "CIS 3381, any 2 courses": the courses a part gets, open slots counted. */
function filledText(courses: readonly OptimizerCourse[]): string {
  const codes = courses.flatMap((c) => c.course.code ?? []);
  const open = courses.length - codes.length;
  const any = open > 0 && `any ${open} ${open === 1 ? "course" : "courses"}`;
  const text = [...codes, any].filter(Boolean).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Why a course ranks where it does, in a few words. */
function rankText(course: OptimizerCourse): string {
  return [
    course.unlocks > 0 &&
      `unlocks ${course.unlocks} ${course.unlocks === 1 ? "course" : "courses"}`,
    course.after.length > 0 &&
      `after ${course.after.length} ${course.after.length === 1 ? "prerequisite" : "prerequisites"}`,
  ]
    .filter(Boolean)
    .join(", ");
}

function OptimizeForm({
  requirements,
  plans,
  firstTerm,
  completed,
  bulletinYear,
  onApply,
}: Omit<OptimizeSheetProps, "open" | "onOpenChange">) {
  const creditsId = useId();
  const summersId = useId();
  const { preferences, update } = usePlanPreferences();
  const codes = useMemo(
    () =>
      requirements.flatMap((r) =>
        requirementParts(r).flatMap((p) => p.options),
      ),
    [requirements],
  );
  const { catalog, loading } = useCatalogCourses(codes, bulletinYear);
  const result = useMemo(
    () =>
      optimizePlan({
        requirements,
        plans,
        firstTerm,
        catalog,
        completed,
        preferences,
      }),
    [requirements, plans, firstTerm, catalog, completed, preferences],
  );

  const courses = [
    ...result.placements.map((p) => p.course),
    ...result.unplaced,
  ];
  const setPriority = (code: string, priority: PlanPriority) =>
    void update({
      priorities: { ...preferences.priorities, [code]: priority },
    });
  const choose = (part: string, code: string) =>
    void update({ choices: { ...preferences.choices, [part]: code } });
  const terms = [...new Set(result.placements.map((p) => p.term))].sort();
  const newTerms = new Set(result.newTerms.map((t) => t.code));
  const count = result.placements.length;

  return (
    <>
      <SheetHeader>
        <SheetTitle>Optimize your plan</SheetTitle>
        <SheetDescription>
          Places what your audit still needs into your terms. A course always
          comes after its prerequisites; among the rest, your priority goes
          first, then the courses that hold up the most others.
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6">
        <div className="grid grid-cols-2 items-end gap-4">
          <Field>
            <FieldTitle id={creditsId}>Credits per term</FieldTitle>
            <Select
              items={CREDIT_CHOICES.map((c) => ({ value: c, label: `${c}` }))}
              value={preferences.creditsPerTerm}
              onValueChange={(value) =>
                value && void update({ creditsPerTerm: value })
              }
            >
              <SelectTrigger aria-labelledby={creditsId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREDIT_CHOICES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal" className="h-8">
            <FieldContent>
              <FieldLabel htmlFor={summersId}>Use summer terms</FieldLabel>
            </FieldContent>
            <Switch
              id={summersId}
              checked={preferences.includeSummers}
              onCheckedChange={(includeSummers) =>
                void update({ includeSummers })
              }
            />
          </Field>
        </div>

        <section
          aria-labelledby="optimize-priorities"
          className="flex flex-col gap-2"
        >
          <h3 id="optimize-priorities" className="font-medium">
            Priorities
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {requirements.map((requirement) => (
              <RequirementRow
                key={requirement.code}
                requirement={requirement}
                priority={preferences.priorities[requirement.code] ?? "normal"}
                courses={courses.filter(
                  (c) => c.course.requirement === requirement.code,
                )}
                catalog={catalog}
                onPriority={(priority) =>
                  setPriority(requirement.code, priority)
                }
                onChoose={choose}
              />
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="optimize-preview"
          className="flex flex-col gap-3 pb-2"
        >
          <h3 id="optimize-preview" className="font-medium">
            Preview
          </h3>
          {loading && (
            <p role="status" className="text-muted-foreground">
              Reading prerequisites from the {bulletinYear} Bulletin…
            </p>
          )}
          {result.unplaced.length > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>
                {result.unplaced.length}{" "}
                {result.unplaced.length === 1 ? "course has" : "courses have"}{" "}
                no term
              </AlertTitle>
              <AlertDescription>
                {result.unplaced
                  .map((c) => c.course.code ?? c.course.title)
                  .join(", ")}
                . Their prerequisites loop, or they need more terms than the
                optimizer adds. Place them by hand.
              </AlertDescription>
            </Alert>
          )}
          {terms.map((term) => {
            const placed = result.placements.filter((p) => p.term === term);
            const credits = placed.reduce(
              (sum, p) => sum + (p.course.course.credits ?? 0),
              0,
            );
            return (
              <article
                key={term}
                aria-label={`${placed[0]!.termDescription} preview`}
                className="flex flex-col gap-1.5 rounded-2xl p-3 ring-1 ring-border ring-inset"
              >
                <header className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    {placed[0]!.termDescription}
                    {newTerms.has(term) && (
                      <Badge variant="info">New term</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    +{formatCredits(credits)} cr
                  </span>
                </header>
                <ul className="flex flex-col gap-1">
                  {placed.map(({ course }) => (
                    <li key={course.key} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium">
                          {course.course.code ?? course.course.title}
                        </span>
                        {course.course.code && (
                          <span className="text-muted-foreground">
                            {" "}
                            {course.course.title}
                          </span>
                        )}
                      </span>
                      {course.priority !== "normal" && (
                        <Badge variant="outline" className="capitalize">
                          {course.priority}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      </div>

      <SheetFooter className="border-t border-border sm:flex-row sm:justify-end">
        <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
        <Button
          disabled={count === 0 || loading}
          onClick={() => onApply(result)}
        >
          {count === 0
            ? "Nothing to place"
            : `Place ${count} ${count === 1 ? "course" : "courses"}`}
        </Button>
      </SheetFooter>
    </>
  );
}

interface RequirementRowProps {
  requirement: NeededRequirement;
  priority: PlanPriority;
  /** The courses the run gives its parts. */
  courses: readonly OptimizerCourse[];
  catalog: (code: string) => CatalogCourse | null;
  onPriority: (priority: PlanPriority) => void;
  onChoose: (part: string, code: string) => void;
}

/** A requirement's priority, and the course each of its parts gets. */
function RequirementRow({
  requirement,
  priority,
  courses,
  catalog,
  onPriority,
  onChoose,
}: RequirementRowProps) {
  const parts = requirementParts(requirement);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 font-medium">{requirement.title}</span>
        <ToggleGroup
          aria-label={`Priority for ${requirement.title}`}
          variant="outline"
          size="sm"
          spacing={0}
          value={[priority]}
          onValueChange={(values) => {
            // Pressing the pressed item empties the group; keep the priority.
            const next = PRIORITIES.find((p) => p.value === values[0])?.value;
            if (next) onPriority(next);
          }}
        >
          {PRIORITIES.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value}>
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {priority !== "skip" && (
        <ul className="flex flex-col gap-1.5">
          {parts.map((part) => {
            const filled = courses.filter((c) => c.part === part.key);
            const chosen = filled.find((c) => c.course.code)?.course.code;
            const why = filled[0] ? rankText(filled[0]) : "";
            return (
              <li
                key={part.key}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
              >
                {parts.length > 1 && (
                  <span className="text-foreground">{part.title}:</span>
                )}
                {part.options.length > 1 && chosen ? (
                  <Select
                    items={part.options.map((o) => ({ value: o, label: o }))}
                    value={chosen}
                    onValueChange={(code) => code && onChoose(part.key, code)}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Course for ${part.title}`}
                      className="w-fit"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {part.options.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                          <span className="text-muted-foreground">
                            {catalog(o)?.title}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <span>
                  {[
                    filledText(
                      filled.filter((c) => !chosen || c.course.code !== chosen),
                    ),
                    why,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
