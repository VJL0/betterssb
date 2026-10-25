/**
 * The plain-text context the AI advisor gets with a question (W3.3). Each
 * part is built only from records the student chose to share.
 */
import type { Audit } from "@workspace/api-client";
import type { TranscriptData } from "./transcript";
import type { TermPlan } from "../types/store";
import { auditGroups } from "./audit-view";
import { creditTotals, formatCredits } from "./dars";
import { termEntries } from "./planner";

/** Keeps a question's context to a few thousand tokens. */
export const MAX_CONTEXT_CHARS = 12_000;
/** Thread titles are the first words of the first question. */
const THREAD_TITLE_CHARS = 48;

const STATUS_WORD = {
  done: "done",
  progress: "in progress",
  needed: "needed",
} as const;

export function auditContext(audit: Audit, storedAt: string): string {
  const lines = [
    `Degree audit (DARS, saved ${storedAt.slice(0, 10)}): ${audit.programTitle}, ${audit.catalogYear} catalog.`,
  ];
  const totals = creditTotals(audit);
  if (totals) {
    lines.push(
      `Credits: ${formatCredits(totals.earned)} earned, ${formatCredits(totals.inProgress)} in progress, ${formatCredits(totals.needed)} still needed of ${formatCredits(totals.total)}.`,
    );
  }
  for (const group of auditGroups(audit)) {
    lines.push(`${group.title}:`);
    for (const line of group.lines) {
      const courses = line.courses.map((c) => c.course).join(", ");
      const options =
        line.status === "needed" && line.options.length > 0
          ? ` Options: ${line.options.join(", ")}.`
          : "";
      lines.push(
        `- ${line.title}: ${STATUS_WORD[line.status]}${courses ? ` (${courses})` : ""}.${options}`,
      );
    }
  }
  return lines.join("\n");
}

export function transcriptContext(transcript: TranscriptData): string {
  const lines = ["Transcript:"];
  if (transcript.gpa !== null) lines.push(`Overall GPA: ${transcript.gpa}.`);
  for (const c of transcript.courses) {
    lines.push(
      `- ${c.term}: ${c.subject} ${c.courseNumber} ${c.title}, ${formatCredits(c.credits)} cr, grade ${c.grade}.`,
    );
  }
  return lines.join("\n");
}

export function planContext(plans: readonly TermPlan[]): string {
  const lines = ["Semester plan:"];
  for (const plan of plans) {
    const entries = termEntries(plan);
    if (entries.length === 0) continue;
    const courses = entries
      .map((e) => (e.code ? `${e.code} ${e.title}` : e.title))
      .join("; ");
    lines.push(`- ${plan.termDescription}: ${courses}.`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

/** The parts the student turned on, trimmed to a size the advisor can take. */
export function advisorContext(parts: readonly string[]): string {
  const text = parts.filter(Boolean).join("\n\n");
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_CHARS)}\n[Trimmed to fit.]`;
}

export function threadTitle(question: string): string {
  const text = question.trim().replace(/\s+/g, " ");
  if (text.length <= THREAD_TITLE_CHARS) return text;
  const cut = text.slice(0, THREAD_TITLE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
