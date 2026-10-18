import { readBannerRows, type BannerRow } from "@/lib/banner-rows";
import {
  hostBefore,
  hostInside,
  isOverlayHost,
  removeCellHosts,
} from "./shadow-host";

export interface RatingSlot {
  name: string;
  container: HTMLElement;
}

/** A Banner section row and the empty shadow roots the overlay renders into. */
export interface OverlayRow extends BannerRow {
  ratingSlots: RatingSlot[];
  seatSlot: HTMLElement | null;
  tagSlot: HTMLElement | null;
}

export interface RowWatcher {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly OverlayRow[];
  start(): void;
  /** Stops watching and removes every host from Banner's tables. */
  stop(): void;
}

const NO_ROWS: readonly OverlayRow[] = [];

function withSlots(row: BannerRow, css: string): OverlayRow {
  return {
    ...row,
    ratingSlots: row.instructors.map((instructor) => ({
      name: instructor.name,
      // Before the name: Banner's cells clip overflow, and long names get
      // Banner's own ellipsis, which would hide a rating placed after them.
      container: hostBefore(instructor.link, "rating", css),
    })),
    seatSlot:
      row.statusCell && row.seats
        ? hostInside(row.statusCell, "seats", css)
        : null,
    tagSlot: row.titleCell ? hostInside(row.titleCell, "tags", css) : null,
  };
}

function sameRows(a: readonly OverlayRow[], b: readonly OverlayRow[]) {
  return (
    a.length === b.length &&
    a.every(
      (row, i) =>
        row.row === b[i]!.row &&
        row.crn === b[i]!.crn &&
        row.seats?.seatsAvailable === b[i]!.seats?.seatsAvailable &&
        row.ratingSlots.length === b[i]!.ratingSlots.length,
    )
  );
}

/** Mutations from the overlay's own hosts don't need another look. */
function onlyOverlayChanges(mutations: readonly MutationRecord[]) {
  return mutations.every((m) =>
    [...m.addedNodes, ...m.removedNodes].every(isOverlayHost),
  );
}

/**
 * Follows Banner's results grids as Banner renders, pages and sorts them,
 * giving each section row its shadow-root slots. A store for
 * useSyncExternalStore: the snapshot changes only when the rows do.
 */
export function createRowWatcher(css: string): RowWatcher {
  let rows = NO_ROWS;
  let observer: MutationObserver | null = null;
  let frame: number | null = null;
  const listeners = new Set<() => void>();

  function publish(next: readonly OverlayRow[]) {
    if (sameRows(rows, next)) return;
    rows = next;
    for (const listener of listeners) listener();
  }

  function scan() {
    frame = null;
    publish(readBannerRows(document).map((row) => withSlots(row, css)));
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => rows,
    start() {
      if (observer) return;
      // Hosts left by an earlier copy of the content script (an extension update).
      removeCellHosts(document);
      observer = new MutationObserver((mutations) => {
        if (onlyOverlayChanges(mutations) || frame !== null) return;
        // Banner renders a page of rows in several steps; read it once.
        frame = requestAnimationFrame(scan);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      scan();
    },
    stop() {
      observer?.disconnect();
      observer = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      removeCellHosts(document);
      publish(NO_ROWS);
    },
  };
}
