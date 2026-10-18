/**
 * The degree audit page's view of a DARS audit (W3.1): requirement groups
 * with their lines marked done, in progress or needed.
 */
import type {
  Audit,
  AuditCourse,
  Progress,
  Requirement,
  SubRequirement,
} from "@workspace/api-client";
import { TOTAL_HOURS_CATEGORY, formatCredits, isNoteOnly } from "./dars";
import { courseKey, splitCourseCode } from "./plan";

export type LineStatus = "done" | "progress" | "needed";

export interface AuditLine {
  id: string;
  title: string;
  status: LineStatus;
  /** Courses DARS applied, taken or in progress. */
  courses: AuditCourse[];
  /** "4/4" when DARS gives credit counts. */
  credits: string | null;
  /** Courses DARS lists as able to fill it. */
  options: string[];
}

export interface AuditGroup {
  code: string;
  title: string;
  lines: AuditLine[];
  done: number;
}

const STATUS: Record<Requirement["status"], LineStatus | null> = {
  complete: "done",
  in_progress: "progress",
  incomplete: "needed",
  // Informational lines with no check mark.
  none: null,
};

function creditsOf(
  earned: Progress | null,
  inProgress: Progress | null,
  needs: Progress | null,
): string | null {
  const have = earned?.credits ?? null;
  const pending = inProgress?.credits ?? null;
  const missing = needs?.credits ?? null;
  if (have === null && pending === null && missing === null) return null;
  const total = (have ?? 0) + (pending ?? 0) + (missing ?? 0);
  return `${formatCredits(have ?? 0)}/${formatCredits(total)}`;
}

function lineFrom(
  requirement: Requirement,
  sub: SubRequirement,
  index: number,
): AuditLine | null {
  const status = STATUS[sub.status];
  if (!status) return null;
  return {
    id: `${requirement.code}-${sub.number || index}`,
    title: sub.title || requirement.title,
    status,
    courses: sub.courses,
    credits: creditsOf(sub.earned, sub.inProgress, sub.needs),
    options: sub.selectFrom,
  };
}

/** A requirement with no sub-requirements is its own single line. */
function wholeLine(requirement: Requirement): AuditLine | null {
  const status = STATUS[requirement.status];
  if (!status) return null;
  return {
    id: requirement.code,
    title: requirement.title,
    status,
    courses: [],
    credits: creditsOf(
      requirement.earned,
      requirement.inProgress,
      requirement.needs,
    ),
    options: [],
  };
}

/** Requirement groups in audit order, skipping notes and the credit totals line. */
export function auditGroups(audit: Audit): AuditGroup[] {
  return audit.requirements
    .filter((r) => !isNoteOnly(r) && r.category !== TOTAL_HOURS_CATEGORY)
    .map((requirement) => {
      const lines =
        requirement.subrequirements.length > 0
          ? requirement.subrequirements.flatMap(
              (sub, i) => lineFrom(requirement, sub, i) ?? [],
            )
          : [wholeLine(requirement) ?? []].flat();
      return {
        code: requirement.code,
        title: requirement.title || requirement.code,
        lines,
        done: lines.filter((l) => l.status === "done").length,
      };
    })
    .filter((group) => group.lines.length > 0);
}

export function countLines(
  groups: readonly AuditGroup[],
): Record<LineStatus | "all", number> {
  const lines = groups.flatMap((g) => g.lines);
  return {
    all: lines.length,
    done: lines.filter((l) => l.status === "done").length,
    progress: lines.filter((l) => l.status === "progress").length,
    needed: lines.filter((l) => l.status === "needed").length,
  };
}

/** Options that are real course codes, not ranges like "CIS 3000-4999". */
export function courseOptions(options: readonly string[]): string[] {
  return options.filter((o) => splitCourseCode(o) !== null);
}

/** The line's options already in a plan, by course key ("CIS2168"). */
export function plannedOptions(
  line: AuditLine,
  planned: ReadonlySet<string>,
): string[] {
  return courseOptions(line.options).filter((o) => planned.has(courseKey(o)));
}

/** The requirement a course counts toward, from the courses DARS applied. */
export function requirementFor(audit: Audit, code: string): string | null {
  const key = courseKey(code);
  for (const requirement of audit.requirements) {
    for (const sub of requirement.subrequirements) {
      if (sub.courses.some((c) => courseKey(c.course) === key)) {
        return sub.title || requirement.title || null;
      }
    }
  }
  return null;
}
