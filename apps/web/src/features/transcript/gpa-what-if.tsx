"use client";

import { useId, useState } from "react";
import { Undo2Icon } from "lucide-react";
import {
  GRADE_POINTS,
  LETTER_GRADES,
  gpaOf,
  isLetterGrade,
  lowestGradeFor,
  neededAverage,
} from "@workspace/shared/lib/gpa";
import { formatCredits } from "@workspace/shared/lib/dars";
import type { SavedCourse } from "@workspace/shared/lib/transcript";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { GpaWhatIf } from "./use-gpa-what-if";

/** Stands in for "no grade yet" on a course in progress. */
const NO_GRADE = "none";
const MAX_GPA = 4;

const LETTER_ITEMS = LETTER_GRADES.map((letter) => ({
  value: letter,
  label: letter,
}));

/** Letter grades, after the course's own grade when it isn't one (W, TR, none…). */
function gradeItems(course: SavedCourse) {
  if (isLetterGrade(course.grade)) return LETTER_ITEMS;
  const own = course.grade || NO_GRADE;
  return [{ value: own, label: course.grade || "—" }, ...LETTER_ITEMS];
}

function formatGpa(gpa: number | null): string {
  return gpa === null ? "—" : gpa.toFixed(2);
}

export function GpaCard({ whatIf }: { whatIf: GpaWhatIf }) {
  const headingId = useId();
  const trying = whatIf.changed > 0;
  return (
    <Card
      aria-labelledby={headingId}
      className="gap-3 p-4"
      render={<section />}
    >
      <h3 id={headingId} className="font-medium">
        {trying ? "What-if GPA" : "GPA"}
      </h3>
      <p
        aria-live="polite"
        className="flex items-baseline gap-1.5 tabular-nums"
      >
        <span className="text-3xl font-medium">
          {formatGpa(trying ? whatIf.whatIfGpa : whatIf.actualGpa)}
        </span>
        <span className="text-muted-foreground">
          {trying ? `actual ${formatGpa(whatIf.actualGpa)}` : "overall"}
        </span>
      </p>
      <p className="text-muted-foreground">
        {trying
          ? `${whatIf.changed} what-if ${whatIf.changed === 1 ? "grade" : "grades"}, not saved.`
          : "Change any grade to see how it moves your GPA."}
      </p>
      {trying && (
        <Button
          variant="outline"
          className="self-start"
          onClick={whatIf.revertAll}
        >
          <Undo2Icon data-icon="inline-start" />
          Revert to actual grades
        </Button>
      )}
      {whatIf.hasCoursesInProgress && <TargetGpa whatIf={whatIf} />}
    </Card>
  );
}

function TargetGpa({ whatIf }: { whatIf: GpaWhatIf }) {
  const id = useId();
  const [value, setValue] = useState("");
  const target = Number(value);
  const valid = value.trim() !== "" && target > 0 && target <= MAX_GPA;
  return (
    <Field>
      <FieldLabel htmlFor={id}>Target GPA</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="3.50"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 tabular-nums"
      />
      <FieldDescription aria-live="polite">
        {valid
          ? targetAnswer(whatIf, target)
          : "The average your courses in progress need to reach it"}
      </FieldDescription>
    </Field>
  );
}

/** What it takes to reach `target` over the courses in progress without a grade. */
function targetAnswer(whatIf: GpaWhatIf, target: number): string {
  const open = whatIf.openCredits;
  if (open === 0) {
    return "Set a course in progress back to — to see what it needs.";
  }
  const credits = `the ${formatCredits(open)} credits you haven't set a grade for`;
  const needed = neededAverage(whatIf.whatIf, open, target);
  const grade = lowestGradeFor(needed);
  if (grade === null) {
    const best = gpaOf({
      hours: whatIf.whatIf.hours + open,
      qualityPoints: whatIf.whatIf.qualityPoints + MAX_GPA * open,
    });
    return `Out of reach: straight A's in ${credits} give ${formatGpa(best)}.`;
  }
  if (needed <= 0)
    return `You'll reach ${target.toFixed(2)} whatever ${credits} earn.`;
  const article = /^[AF]/.test(grade) ? "an" : "a";
  return `You need about ${article} ${grade} average (${GRADE_POINTS[grade].toFixed(2)}) in ${credits}.`;
}

/**
 * The what-if GPA under the grades on narrower screens, where the card sits
 * above the terms and scrolls away.
 */
export function WhatIfGpaPill({ whatIf }: { whatIf: GpaWhatIf }) {
  return (
    <div className="sticky bottom-4 z-30 flex justify-center lg:hidden">
      <p
        aria-live="polite"
        className="rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground tabular-nums shadow-lg"
      >
        What-if GPA {formatGpa(whatIf.whatIfGpa)} · actual{" "}
        {formatGpa(whatIf.actualGpa)}
      </p>
    </div>
  );
}

/**
 * A course's grade, which the student can change to see its effect on the
 * GPA. A changed grade stands out and can be reverted on its own.
 */
export function GradeCell({
  course,
  whatIf,
}: {
  course: SavedCourse;
  whatIf: GpaWhatIf;
}) {
  const grade = whatIf.gradeOf(course);
  const changed = grade !== course.grade;
  const items = gradeItems(course);
  const code = `${course.subject} ${course.courseNumber}`;
  const actual = course.grade || "no grade";
  return (
    <span className="flex items-center gap-1">
      <Select
        items={items}
        value={grade || NO_GRADE}
        onValueChange={(picked) => whatIf.setGrade(course, picked ?? "")}
      >
        <SelectTrigger
          size="sm"
          aria-label={`${course.category === "in_progress" ? "Expected grade" : "Grade"} for ${code}`}
          className={cn(
            // Narrow, so two-letter grades ("WF", "NT") need the trimmed padding to fit.
            "w-16 bg-secondary px-2 hover:bg-secondary-hover",
            changed &&
              "border-primary bg-background font-medium text-primary italic hover:bg-secondary",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        {/* As narrow as the picker: grades are two letters at most. */}
        <SelectContent className="min-w-(--anchor-width)">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {changed ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Revert ${code} to ${actual}`}
                onClick={() => whatIf.setGrade(course, course.grade)}
              />
            }
          >
            <Undo2Icon />
          </TooltipTrigger>
          <TooltipContent>Revert to {actual}</TooltipContent>
        </Tooltip>
      ) : (
        // Holds the revert button's place, so changing a grade doesn't reflow the table.
        <span aria-hidden className="size-6 shrink-0" />
      )}
    </span>
  );
}
