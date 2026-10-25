import { toast } from "sonner";
import { addCourse, emptyPlan } from "@workspace/shared/lib/plan";
import {
  hasCourse,
  moveEntry,
  removeEntry,
  retermPlan,
  termEntries,
  type TermEntry,
} from "@workspace/shared/lib/planner";
import type { TermPlan } from "@workspace/shared/types/store";
import { undoToast } from "@/lib/undo-toast";
import type { CourseDrag, NewCourse } from "./course-drag";

/** Plans to save and terms to delete, in one step the student can undo. */
interface PlanChange {
  save?: TermPlan[];
  remove?: string[];
}

interface PlanStore {
  plans: readonly TermPlan[];
  save: (plan: TermPlan) => Promise<void>;
  remove: (term: string) => Promise<void>;
}

/** The planner's edits, each saved right away with an undo. */
export function usePlanEdits({ plans, save, remove }: PlanStore) {
  async function apply(change: PlanChange) {
    await Promise.all([
      ...(change.save ?? []).map(save),
      ...(change.remove ?? []).map(remove),
    ]);
  }

  async function commit(change: PlanChange, undo: PlanChange, message: string) {
    try {
      await apply(change);
      undoToast(message, () => void apply(undo));
    } catch {
      toast.error("Couldn't save your plan. Try again.");
    }
  }

  const now = () => new Date().toISOString();

  function addTo(plan: TermPlan, course: NewCourse) {
    const name = course.code ?? course.title;
    if (course.code && hasCourse(plan, course.code)) {
      toast.info(`${name} is already in ${plan.termDescription}.`);
      return;
    }
    const planned = { ...course, id: crypto.randomUUID(), addedAt: now() };
    void commit(
      { save: [addCourse(plan, planned, now())] },
      { save: [plan] },
      `Added ${name} to ${plan.termDescription}`,
    );
  }

  function move(from: TermPlan, to: TermPlan, key: string) {
    const entry = termEntries(from).find((e) => e.key === key);
    if (!entry) return;
    const name = entry.code ?? entry.title;
    const moved = moveEntry(from, to, key, now());
    if (!moved) {
      toast.info(`${name} is already in ${to.termDescription}.`);
      return;
    }
    void commit(
      { save: [moved.from, moved.to] },
      { save: [from, to] },
      `Moved ${name} to ${to.termDescription}`,
    );
  }

  return {
    removeCourse(plan: TermPlan, entry: TermEntry) {
      void commit(
        { save: [removeEntry(plan, entry.key, now())] },
        { save: [plan] },
        `Removed ${entry.code ?? entry.title} from ${plan.termDescription}`,
      );
    },

    addCourse: addTo,

    drop(target: TermPlan, drag: CourseDrag) {
      if (drag.kind === "course") {
        addTo(target, drag.course);
        return;
      }
      const from = plans.find((p) => p.term === drag.term);
      if (from && from.term !== target.term) move(from, target, drag.key);
    },

    async addTerm(code: string, name: string): Promise<boolean> {
      try {
        await save(emptyPlan(code, name));
        toast.success(`Added ${name}`);
        return true;
      } catch {
        toast.error("Couldn't add the term. Try again.");
        return false;
      }
    },

    changeTerm(plan: TermPlan, code: string, name: string) {
      const moved = retermPlan(plan, code, name, now());
      void commit(
        { save: [moved], remove: [plan.term] },
        { save: [plan], remove: [code] },
        `Moved ${plan.termDescription} to ${name}`,
      );
    },

    deleteTerm(plan: TermPlan, message: string) {
      void commit({ remove: [plan.term] }, { save: [plan] }, message);
    },
  };
}
