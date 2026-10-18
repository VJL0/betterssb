import { useCallback, useMemo } from "react";
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
  const plan: TermPlan = useMemo(
    () => doc.value ?? emptyPlan(term, termDescription),
    [doc.value, term, termDescription],
  );
  const { save } = doc;

  const apply = useCallback(
    (edit: (current: TermPlan, now: string) => TermPlan) =>
      save(edit(plan, new Date().toISOString())),
    [save, plan],
  );

  return {
    plan,
    status: doc.status,
    add: useCallback(
      (section: PlannedSection) =>
        apply((p, now) => addSection(p, section, now)),
      [apply],
    ),
    remove: useCallback(
      (crn: string) => apply((p, now) => removeSection(p, crn, now)),
      [apply],
    ),
    replaceSections: useCallback(
      (sections: PlannedSection[]) =>
        apply((p, now) => replaceSections(p, sections, now)),
      [apply],
    ),
    addCourse: useCallback(
      (course: PlannedCourse) => apply((p, now) => addCourse(p, course, now)),
      [apply],
    ),
    removeCourse: useCallback(
      (id: string) => apply((p, now) => removeCourse(p, id, now)),
      [apply],
    ),
    /** Puts back an earlier version, for Undo. */
    restore: useCallback((previous: TermPlan) => save(previous), [save]),
  };
}
