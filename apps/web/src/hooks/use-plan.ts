import {
  addCourse,
  addSection,
  emptyPlan,
  removeCourse,
  removeSection,
  replaceSections,
} from "@workspace/shared/lib/plan";
import { planKey } from "@workspace/shared/lib/store";
import type {
  PlannedCourse,
  PlannedSection,
  TermPlan,
} from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

/** One term's plan, with edits that save to the local store right away. */
export function usePlan(term: string, termDescription: string) {
  const doc = useStoreDocument(planKey(term));
  const plan: TermPlan = doc.value ?? emptyPlan(term, termDescription);
  const { save } = doc;

  const apply = (edit: (current: TermPlan, now: string) => TermPlan) =>
    save(edit(plan, new Date().toISOString()));

  return {
    plan,
    status: doc.status,
    add: (section: PlannedSection) =>
      apply((p, now) => addSection(p, section, now)),
    remove: (crn: string) => apply((p, now) => removeSection(p, crn, now)),
    replaceSections: (sections: PlannedSection[]) =>
      apply((p, now) => replaceSections(p, sections, now)),
    addCourse: (course: PlannedCourse) =>
      apply((p, now) => addCourse(p, course, now)),
    removeCourse: (id: string) => apply((p, now) => removeCourse(p, id, now)),
    /** Puts back an earlier version, for Undo. */
    restore: (previous: TermPlan) => save(previous),
  };
}
