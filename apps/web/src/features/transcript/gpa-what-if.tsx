"use client";

import { useId, useState } from "react";
import { CalculatorIcon } from "lucide-react";
import {
  GRADE_POINTS,
  LETTER_GRADES,
  gpaOf,
  lowestGradeFor,
  neededAverage,
  type LetterGrade,
} from "@workspace/shared/lib/gpa";
import { formatCredits } from "@workspace/shared/lib/dars";
import type { SavedCourse } from "@workspace/shared/lib/transcript";
import { Badge } from "@workspace/ui/components/badge";
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
import type { GpaWhatIf } from "./use-gpa-what-if";

/** Stands in for "no expected grade yet" on a course in progress. */
const NO_GRADE = "none";
const MAX_GPA = 4;

const LETTER_ITEMS = LETTER_GRADES.map((letter) => ({
  value: letter,
  label: letter,
}));
const EXPECTED_ITEMS = [{ value: NO_GRADE, label: "—" }, ...LETTER_ITEMS];

function formatGpa(gpa: number | null): string {
  return gpa === null ? "—" : gpa.toFixed(2);
}

/** The GPA card: the overall GPA, and the what-if one once grades are being tried. */
export function GpaCard({
  officialGpa,
  whatIf,
}: {
  officialGpa: number | null;
  whatIf: GpaWhatIf;
}) {
  const headingId = useId();
  return (
    <Card
      aria-labelledby={headingId}
      className="gap-3 p-4"
      render={<section />}
    >
      <h3 id={headingId} className="font-medium">
        {whatIf.active ? "What-if GPA" : "GPA"}
      </h3>
      {whatIf.active ? (
        <WhatIfTotals whatIf={whatIf} />
      ) : (
        <>
          <p className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-3xl font-medium">
              {formatGpa(officialGpa)}
            </span>
            <span className="text-muted-foreground">overall</span>
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={whatIf.start}
          >
            <CalculatorIcon data-icon="inline-start" />
            Try other grades
          </Button>
        </>
      )}
    </Card>
  );
}

function WhatIfTotals({ whatIf }: { whatIf: GpaWhatIf }) {
  return (
    <>
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-3xl font-medium">
          {formatGpa(whatIf.whatIfGpa)}
        </span>
        <span className="text-muted-foreground">
          from {formatGpa(whatIf.nowGpa)} now
        </span>
      </p>
      <p className="text-muted-foreground">
        Change grades or set expected ones below. Nothing here is saved, and the
        advisor still sees your real grades.
      </p>
      <TargetGpa whatIf={whatIf} />
      <div className="flex flex-wrap gap-2">
        {whatIf.changed > 0 && (
          <Button variant="outline" onClick={whatIf.reset}>
            Reset
          </Button>
        )}
        <Button variant="ghost" onClick={whatIf.done}>
          Done
        </Button>
      </div>
    </>
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
      {valid && (
        <FieldDescription aria-live="polite">
          {targetAnswer(whatIf, target)}
        </FieldDescription>
      )}
    </Field>
  );
}

/** What it takes to reach `target` over the in-progress credits left open. */
function targetAnswer(whatIf: GpaWhatIf, target: number): string {
  const open = whatIf.openCredits;
  if (open === 0) {
    return "Clear an expected grade on a course in progress to see what it needs.";
  }
  const credits = `your ${formatCredits(open)} open credits`;
  const needed = neededAverage(whatIf.whatIf, open, target);
  const grade = lowestGradeFor(needed);
  if (grade === null) {
    const best = gpaOf({
      hours: whatIf.whatIf.hours + open,
      qualityPoints: whatIf.whatIf.qualityPoints + MAX_GPA * open,
    });
    return `Out of reach: straight A's across ${credits} give ${formatGpa(best)}.`;
  }
  if (needed <= 0)
    return `You'll reach ${target.toFixed(2)} whatever ${credits} earn.`;
  const article = /^[AF]/.test(grade) ? "an" : "a";
  return `You need about ${article} ${grade} average (${GRADE_POINTS[grade].toFixed(2)}) across ${credits}.`;
}

/**
 * The what-if GPA under the grade pickers on narrower screens, where the
 * card sits above the terms and scrolls away.
 */
export function WhatIfGpaPill({ whatIf }: { whatIf: GpaWhatIf }) {
  return (
    <div className="sticky bottom-4 z-30 flex justify-center lg:hidden">
      <p
        aria-live="polite"
        className="rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground tabular-nums shadow-lg"
      >
        What-if GPA {formatGpa(whatIf.whatIfGpa)} · from{" "}
        {formatGpa(whatIf.nowGpa)}
      </p>
    </div>
  );
}

/** A course's grade: a picker while trying grades, otherwise the transcript's. */
export function GradeCell({
  course,
  whatIf,
}: {
  course: SavedCourse;
  whatIf: GpaWhatIf;
}) {
  if (!whatIf.active || !whatIf.canChange(course)) {
    return course.grade ? (
      <Badge variant="secondary">{course.grade}</Badge>
    ) : null;
  }
  const grade = whatIf.gradeOf(course);
  const inProgress = course.category === "in_progress";
  const changed = grade !== course.grade;
  const items = inProgress ? EXPECTED_ITEMS : LETTER_ITEMS;
  return (
    <span className="flex items-center gap-2">
      <Select
        items={items}
        value={grade || NO_GRADE}
        onValueChange={(picked) =>
          whatIf.setGrade(
            course,
            picked === NO_GRADE || picked === null
              ? null
              : (picked as LetterGrade),
          )
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={`${inProgress ? "Expected grade" : "Grade"} for ${course.subject} ${course.courseNumber}`}
          className="w-20"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {changed && !inProgress && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          was {course.grade}
        </span>
      )}
    </span>
  );
}
