/** What the Banner overlay is showing on its tab, for the popup's Today tab. */
export interface OverlayStatus {
  /** Section rows with ratings, seats and tags. */
  sections: number;
  /** How many of those are in the student's plan. */
  inPlan: number;
}

let current: OverlayStatus | null = null;

/** Null while the overlay is off or hasn't found a results grid. */
export function setOverlayStatus(status: OverlayStatus | null): void {
  current = status;
}

export function overlayStatus(): OverlayStatus | null {
  return current;
}
