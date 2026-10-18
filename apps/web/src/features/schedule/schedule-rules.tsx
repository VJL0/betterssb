import { useId } from "react";
import type { CourseColor } from "@workspace/shared/lib/course-colors";
import {
  DAY_NAMES,
  WEEKDAYS,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { CourseDot } from "@workspace/ui/components/course-badge";
import {
  Field,
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { HourSelect } from "@/components/hour-select";
import { PRESSED_FILTER_CLASS } from "@/lib/filter-styles";
import {
  DEFAULT_RULES,
  type CourseMode,
  type PlanCourse,
  type RankBy,
  type ScheduleRules,
} from "./schedule-options";

const RANK_LABEL: Record<RankBy, string> = {
  best: "Best",
  rating: "Rating",
  fewerDays: "Fewer days",
};

interface ScheduleRulesProps {
  rules: ScheduleRules;
  onChange: (rules: ScheduleRules) => void;
  courses: readonly PlanCourse[];
  colorFor: (courseId: string) => CourseColor | null;
  /** Why a course is missing from the schedules, by course id. */
  notes: ReadonlyMap<string, string>;
  /** Ranking by rating needs a school for Rate My Professors. */
  ratingsAvailable: boolean;
}

/** The W2.2 rules card: hard limits on days and times, ranking, and per-course choices. */
export function ScheduleRulesCard({
  rules,
  onChange,
  courses,
  colorFor,
  notes,
  ratingsAvailable,
}: ScheduleRulesProps) {
  const ids = useId();
  const set = (patch: Partial<ScheduleRules>) =>
    onChange({ ...rules, ...patch });
  const isDefault =
    rules.days.length === DEFAULT_RULES.days.length &&
    rules.startAfter === null &&
    rules.endBefore === null &&
    Object.values(rules.modes).every((m) => m === "any");

  return (
    <Card
      aria-labelledby={`${ids}-heading`}
      className="gap-4 p-4"
      render={<section />}
    >
      <div className="flex items-center justify-between">
        <h2 id={`${ids}-heading`} className="text-base font-medium">
          Rules
        </h2>
        <Button
          variant="ghost"
          size="xs"
          disabled={isDefault}
          onClick={() => onChange({ ...DEFAULT_RULES, rankBy: rules.rankBy })}
        >
          Reset
        </Button>
      </div>

      <FieldSet>
        <FieldLegend variant="label">Days on campus</FieldLegend>
        <ToggleGroup
          multiple
          variant="outline"
          spacing={1}
          value={rules.days}
          onValueChange={(days) =>
            set({
              days: WEEKDAYS.filter((d) => (days as WeekDay[]).includes(d)),
            })
          }
          className="w-full"
        >
          {WEEKDAYS.map((day) => (
            <ToggleGroupItem
              key={day}
              value={day}
              aria-label={DAY_NAMES[day]}
              className={`flex-1 ${PRESSED_FILTER_CLASS}`}
            >
              {day}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      <div className="grid grid-cols-2 gap-2">
        <Field className="gap-1.5">
          <span className="text-xs text-muted-foreground">Start after</span>
          <HourSelect
            label="Start after"
            className="w-full tabular-nums"
            value={rules.startAfter}
            onChange={(startAfter) => set({ startAfter })}
          />
        </Field>
        <Field className="gap-1.5">
          <span className="text-xs text-muted-foreground">End before</span>
          <HourSelect
            label="End before"
            className="w-full tabular-nums"
            value={rules.endBefore}
            onChange={(endBefore) => set({ endBefore })}
          />
        </Field>
      </div>

      <FieldSet>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FieldLegend variant="label" className="mb-0">
            Rank by
          </FieldLegend>
          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[rules.rankBy]}
            onValueChange={(value) => {
              const picked = value[0] as RankBy | undefined;
              if (picked) set({ rankBy: picked });
            }}
          >
            {(Object.keys(RANK_LABEL) as RankBy[]).map((rank) => (
              <ToggleGroupItem
                key={rank}
                value={rank}
                size="sm"
                disabled={rank === "rating" && !ratingsAvailable}
                className={PRESSED_FILTER_CLASS}
              >
                {RANK_LABEL[rank]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {!ratingsAvailable && (
          <FieldDescription>
            Choose your school in Settings to rank by rating.
          </FieldDescription>
        )}
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Courses</FieldLegend>
        <ul className="flex flex-col gap-1.5">
          {courses.map((course) => (
            <CourseRow
              key={course.courseId}
              course={course}
              color={colorFor(course.courseId)}
              mode={rules.modes[course.courseId] ?? "any"}
              note={notes.get(course.courseId)}
              onMode={(mode) =>
                set({ modes: { ...rules.modes, [course.courseId]: mode } })
              }
            />
          ))}
        </ul>
      </FieldSet>
    </Card>
  );
}

function CourseRow({
  course,
  color,
  mode,
  note,
  onMode,
}: {
  course: PlanCourse;
  color: CourseColor | null;
  mode: CourseMode;
  note: string | undefined;
  onMode: (mode: CourseMode) => void;
}) {
  const planned = course.plannedSections.length > 0;
  const plannedLabel = `Only ${course.plannedSections.join(", ")}`;
  return (
    <li className="flex min-h-8 items-center gap-2">
      {color && <CourseDot color={color} />}
      <span className="min-w-0 flex-1">
        {course.code}
        {course.credits !== null && (
          <span className="text-muted-foreground"> · {course.credits} cr</span>
        )}
        {note && (
          <span className="block text-xs text-muted-foreground">{note}</span>
        )}
      </span>
      {planned ? (
        <Select
          items={[
            { value: "any", label: "Any section" },
            { value: "planned", label: plannedLabel },
          ]}
          value={mode}
          onValueChange={(value) => onMode((value as CourseMode) ?? "any")}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Sections of ${course.code}`}
            className="max-w-36 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any section</SelectItem>
            <SelectItem value="planned">{plannedLabel}</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">Any section</span>
      )}
    </li>
  );
}
