import {
  formatCredits,
  type NeededRequirement,
} from "@workspace/shared/lib/dars";
import { splitCourseCode } from "@workspace/shared/lib/plan";
import type { NewCourse } from "./course-drag";
import { CourseRow } from "./course-row";

/** How many course options to name under a requirement. */
const OPTIONS_SHOWN = 3;

interface StillNeededProps {
  /** Requirements the audit says are still needed and no term has yet. */
  requirements: readonly NeededRequirement[];
  /** Whether the audit lists anything as still needed at all. */
  anyNeeded: boolean;
  targetName: string | null;
  onAdd: (course: NewCourse) => void;
}

function optionsText(options: readonly string[]): string {
  const shown = options.slice(0, OPTIONS_SHOWN).join(", ");
  const more = options.length - OPTIONS_SHOWN;
  return more > 0 ? `${shown} or ${more} more` : shown;
}

/** The course a requirement adds: its one course if DARS names exactly one. */
function requirementCourse(requirement: NeededRequirement): NewCourse {
  const only =
    requirement.options.length === 1 ? requirement.options[0]! : null;
  return {
    code: only && splitCourseCode(only) ? only : null,
    title: requirement.title,
    credits: requirement.credits,
    requirement: requirement.code,
  };
}

/** W2.3 panel tab: requirements from the audit that still need a term. */
export function StillNeeded({
  requirements,
  anyNeeded,
  targetName,
  onAdd,
}: StillNeededProps) {
  if (requirements.length === 0) {
    return (
      <p className="mx-2 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
        {anyNeeded
          ? "Every requirement has a term."
          : "Your audit shows nothing left to plan."}
      </p>
    );
  }
  return (
    <ul aria-label="Still needed" className="flex flex-col">
      {requirements.map((requirement) => {
        const course = requirementCourse(requirement);
        return (
          <CourseRow
            key={requirement.code}
            course={course}
            name={requirement.title}
            subtitle={optionsText(requirement.options)}
            credits={
              requirement.credits === null
                ? null
                : `${formatCredits(requirement.credits)} cr`
            }
            status={null}
            targetName={targetName}
            onAdd={() => onAdd(course)}
          />
        );
      })}
    </ul>
  );
}
