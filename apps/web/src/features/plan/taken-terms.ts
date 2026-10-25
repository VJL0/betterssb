import type { Audit, TranscriptData } from "@workspace/api-client";
import { courseKey, emptyPlan } from "@workspace/shared/lib/plan";
import {
  formatTermName,
  TEMPLE_SEASONS,
  templeTermName,
} from "@workspace/shared/lib/terms";
import type { TermPlan } from "@workspace/shared/types/store";

const DARS_SEASONS: Record<string, string> = {
  SP: "03",
  S1: "20",
  S2: "26",
  FL: "36",
  FA: "36",
};
const DARS_CENTURY = 2000;
// Unspecified summer sessions stay separate from Summer I and II.
const OTHER_SEASONS: Record<string, string> = { winter: "01", summer: "19" };
const IN_PROGRESS_GRADES = new Set(["", "IP", "IN PROGRESS", "RG"]);

function historyTermCode(label: string): string | null {
  const trimmed = label.trim();
  if (templeTermName(trimmed)) return trimmed;
  const dars = /^(SP|S1|S2|FL|FA)(\d{2})$/i.exec(trimmed);
  if (dars)
    return `${DARS_CENTURY + Number(dars[2])}${DARS_SEASONS[dars[1]!.toUpperCase()]}`;
  const named =
    /^(Spring|Summer I|Summer II|Summer|Winter|Fall) (\d{4})$/i.exec(
      formatTermName(trimmed),
    );
  const season = TEMPLE_SEASONS.find(
    (value) => value.name.toLowerCase() === named?.[1]?.toLowerCase(),
  );
  const seasonCode =
    season?.code ?? OTHER_SEASONS[named?.[1]?.toLowerCase() ?? ""];
  return named && seasonCode ? `${named[2]}${seasonCode}` : null;
}

export interface TakenTerm extends TermPlan {
  inProgress: boolean;
}

/** Read-only history derived from saved records, never persisted as planned credits. */
export function takenTerms(
  audit: Audit | null,
  transcript: TranscriptData | null,
): TakenTerm[] {
  const terms = new Map<string, TakenTerm>();
  function add(
    termLabel: string,
    code: string,
    title: string,
    credits: number | null,
    inProgress: boolean,
  ) {
    const term = historyTermCode(termLabel);
    if (!term) return;
    const plan = terms.get(term) ?? {
      ...emptyPlan(term, templeTermName(term) ?? formatTermName(termLabel)),
      inProgress: false,
    };
    plan.inProgress ||= inProgress;
    const key = courseKey(code);
    if (!plan.courses.some((course) => course.id === key)) {
      plan.courses.push({
        id: key,
        code: code.trim().replace(/\s+/g, " "),
        title,
        credits,
        requirement: null,
        addedAt: "",
      });
    }
    terms.set(term, plan);
  }
  for (const course of transcript?.courses ?? []) {
    add(
      course.term,
      `${course.subject} ${course.courseNumber}`,
      course.title,
      course.credits,
      IN_PROGRESS_GRADES.has(course.grade.trim().toUpperCase()),
    );
  }
  for (const requirement of audit?.requirements ?? []) {
    for (const part of requirement.subrequirements) {
      for (const course of part.courses) {
        add(
          historyTermCode(course.bannerTerm) ? course.bannerTerm : course.term,
          course.course,
          course.title,
          course.credits,
          course.inProgress,
        );
      }
    }
  }
  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}
