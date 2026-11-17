import { hostBefore, isOverlayHost, removeRatingHosts } from "./shadow-host";

/**
 * Instructor links in Banner 9's class search results grid (the same grid on
 * Browse Classes, Plan Ahead and Register's Find Classes). The cell's
 * `data-property` survives Banner hiding columns at narrow widths.
 */
const INSTRUCTOR_LINKS = 'td[data-property="instructor"] a.email';

export interface RatingSlot {
  /** The instructor's name as Banner shows it. */
  name: string;
  /** Where the rating renders: a shadow root right before Banner's link. */
  container: HTMLElement;
}

export interface RatingSlotWatcher {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly RatingSlot[];
  start(): void;
  /** Stops watching and removes every rating host from Banner's tables. */
  stop(): void;
}

const NO_SLOTS: readonly RatingSlot[] = [];

function readSlots(css: string): RatingSlot[] {
  return [...document.querySelectorAll(INSTRUCTOR_LINKS)].flatMap((link) => {
    const name = link.textContent?.replace(/\s+/g, " ").trim() ?? "";
    // Before the name: Banner's cells clip overflow, and long names get
    // Banner's own ellipsis, which would hide a rating placed after them.
    return name ? [{ name, container: hostBefore(link, css) }] : [];
  });
}

function sameSlots(a: readonly RatingSlot[], b: readonly RatingSlot[]) {
  return (
    a.length === b.length &&
    a.every(
      (slot, i) =>
        slot.container === b[i]!.container && slot.name === b[i]!.name,
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
 * giving each instructor link a rating slot. A store for
 * useSyncExternalStore: the snapshot changes only when the slots do.
 */
export function createRatingSlotWatcher(css: string): RatingSlotWatcher {
  let slots = NO_SLOTS;
  let observer: MutationObserver | null = null;
  let frame: number | null = null;
  const listeners = new Set<() => void>();

  function publish(next: readonly RatingSlot[]) {
    if (sameSlots(slots, next)) return;
    slots = next;
    for (const listener of listeners) listener();
  }

  function scan() {
    frame = null;
    publish(readSlots(css));
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => slots,
    start() {
      if (observer) return;
      // Hosts left by an earlier copy of the content script (an extension update).
      removeRatingHosts(document);
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
      removeRatingHosts(document);
      publish(NO_SLOTS);
    },
  };
}
