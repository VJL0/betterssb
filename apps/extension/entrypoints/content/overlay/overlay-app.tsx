import { useEffect, useMemo, useSyncExternalStore } from "react";
import { clashesWithPlan, type PlanClash } from "@workspace/shared/lib/plan";
import { planKey, settingsOrDefaults } from "@workspace/shared/lib/store";
import type { TermPlan } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/hooks/use-store-document";
import { RowOverlay } from "./row-overlay";
import type { OverlayRow, RowWatcher } from "./row-watcher";

function pageClashesOf(
  rows: readonly OverlayRow[],
  plan: TermPlan | null,
): Map<string, PlanClash[]> {
  const byCrn = new Map<string, PlanClash[]>();
  if (!plan) return byCrn;
  for (const row of rows) {
    const clashes = clashesWithPlan(row, plan.sections);
    if (clashes.length > 0) byCrn.set(row.crn, clashes);
  }
  return byCrn;
}

/**
 * E3.1 Banner overlay: ratings beside instructors, and plan and conflict
 * tags under titles.
 * The one Banner-pages setting turns all of it off.
 */
export function OverlayApp({
  watcher,
  popupContainer,
}: {
  watcher: RowWatcher;
  popupContainer: HTMLElement;
}) {
  const settings = useStoreDocument("settings");
  const { bannerOverlay, term } = settingsOrDefaults(settings.value);
  const enabled = settings.loaded && bannerOverlay;

  useEffect(() => {
    if (!enabled) return;
    watcher.start();
    return () => watcher.stop();
  }, [enabled, watcher]);

  const rows = useSyncExternalStore(watcher.subscribe, watcher.getSnapshot);
  // The page's own term first: the student may be browsing another term.
  const pageTerm = rows.find((row) => row.term)?.term ?? term ?? "";

  return enabled ? (
    <PageOverlay rows={rows} term={pageTerm} popupContainer={popupContainer} />
  ) : null;
}

function PageOverlay({
  rows,
  term,
  popupContainer,
}: {
  rows: readonly OverlayRow[];
  term: string;
  popupContainer: HTMLElement;
}) {
  const plan = useStoreDocument(planKey(term)).value;
  const planned = useMemo(
    () => new Set(plan?.sections.map((s) => s.crn)),
    [plan],
  );
  const clashes = useMemo(() => pageClashesOf(rows, plan), [rows, plan]);

  return (
    <>
      {rows.map((row, index) => (
        <RowOverlay
          key={`${index}:${row.crn}`}
          row={row}
          inPlan={planned.has(row.crn)}
          clashes={clashes.get(row.crn) ?? []}
          popupContainer={popupContainer}
        />
      ))}
    </>
  );
}
