import { useEffect, useMemo, useSyncExternalStore } from "react";
import { clashesWithPlan } from "@workspace/shared/lib/plan";
import { planKey, withSettingDefaults } from "@workspace/shared/lib/store";
import type { TermPlan } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/hooks/use-store-document";
import { setOverlayStatus } from "@/lib/overlay-status";
import { PlanDock, type PageClash } from "./plan-dock";
import { RowOverlay } from "./row-overlay";
import type { OverlayRow, RowWatcher } from "./row-watcher";

function rowLabel(row: OverlayRow): string {
  return row.courseCode
    ? `${row.courseCode} · ${row.section}`
    : `CRN ${row.crn}`;
}

function pageClashesOf(
  rows: readonly OverlayRow[],
  plan: TermPlan | null,
): Map<string, PageClash> {
  const byCrn = new Map<string, PageClash>();
  if (!plan) return byCrn;
  for (const row of rows) {
    const clashes = clashesWithPlan(row, plan.sections);
    if (clashes.length > 0) {
      byCrn.set(row.crn, { crn: row.crn, label: rowLabel(row), clashes });
    }
  }
  return byCrn;
}

/**
 * E3.1 Banner overlay: ratings beside instructors, seat meters under
 * Banner's seat text, plan and conflict tags under titles, and the plan dock.
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
  const { bannerOverlay, term } = withSettingDefaults(settings.value);
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

  useEffect(() => {
    const inPlan = rows.filter((row) => planned.has(row.crn)).length;
    setOverlayStatus({ sections: rows.length, inPlan });
    return () => setOverlayStatus(null);
  }, [rows, planned]);

  return (
    <>
      {rows.map((row, index) => (
        <RowOverlay
          key={`${index}:${row.crn}`}
          row={row}
          inPlan={planned.has(row.crn)}
          clashes={clashes.get(row.crn)?.clashes ?? []}
          popupContainer={popupContainer}
        />
      ))}
      {plan && plan.sections.length > 0 && (
        <PlanDock plan={plan} pageClashes={[...clashes.values()]} />
      )}
    </>
  );
}
