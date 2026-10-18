import { useCallback, useEffect, useState } from "react";
import { planKey } from "@workspace/shared/lib/store";
import type { StoreKey, TermPlan } from "@workspace/shared/types/store";
import { useStoreState, type DocumentStatus } from "@/lib/store/store-context";

const PLAN_PREFIX = "plan:";

function isPlanKey(key: StoreKey): key is `plan:${string}` {
  return key.startsWith(PLAN_PREFIX);
}

async function loadPlans(
  store: NonNullable<ReturnType<typeof storeOf>>,
): Promise<TermPlan[]> {
  const keys = (await store.keys()).filter(isPlanKey);
  const plans = await Promise.all(keys.map((key) => store.get(key)));
  return plans
    .filter((p): p is TermPlan => p !== null)
    .sort((a, b) => a.term.localeCompare(b.term));
}

function storeOf(state: ReturnType<typeof useStoreState>) {
  return state.status === "ready" ? state.opened.store : null;
}

/** Every term's plan, oldest term first, kept current as any of them changes. */
export function usePlans(): {
  plans: TermPlan[];
  status: DocumentStatus;
  save: (plan: TermPlan) => Promise<void>;
} {
  const state = useStoreState();
  const store = storeOf(state);
  const [plans, setPlans] = useState<TermPlan[]>([]);
  const [status, setStatus] = useState<DocumentStatus>("loading");

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    const load = () =>
      loadPlans(store).then(
        (loaded) => {
          if (cancelled) return;
          setPlans(loaded);
          setStatus("ready");
        },
        () => !cancelled && setStatus("error"),
      );
    void load();
    const unsubscribe = store.subscribe((key) => {
      if (isPlanKey(key)) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store]);

  const save = useCallback(
    async (plan: TermPlan) => {
      if (!store) throw new Error("Your saved data isn't open yet.");
      setPlans((current) =>
        [...current.filter((p) => p.term !== plan.term), plan].sort((a, b) =>
          a.term.localeCompare(b.term),
        ),
      );
      await store.set(planKey(plan.term), plan);
    },
    [store],
  );

  return { plans, status: state.status === "error" ? "error" : status, save };
}
