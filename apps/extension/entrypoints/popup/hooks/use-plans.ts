import { useEffect, useState } from "react";
import type { TermPlan } from "@workspace/shared/types/store";
import { extensionStore } from "@/lib/local-store";

/** Every saved term plan, kept current as any of them changes. */
export function usePlans(): TermPlan[] {
  const [plans, setPlans] = useState<TermPlan[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const keys = (await extensionStore.keys()).filter((k) =>
        k.startsWith("plan:"),
      ) as `plan:${string}`[];
      const docs = await Promise.all(keys.map((k) => extensionStore.get(k)));
      if (!cancelled) setPlans(docs.filter((d): d is TermPlan => d !== null));
    };
    void load();
    const unsubscribe = extensionStore.subscribe((key) => {
      if (key.startsWith("plan:")) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return plans;
}
