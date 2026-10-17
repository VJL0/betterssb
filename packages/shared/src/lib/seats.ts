/** Seats at or above this count read as "open"; fewer read as "few left". */
export const FEW_SEATS_THRESHOLD = 5;

export type SeatTone = "success" | "warning" | "destructive" | "muted";

/** The Banner section fields a seat reading needs. */
export interface SeatCounts {
  seatsAvailable: number;
  maximumEnrollment: number;
  waitCount: number;
  waitCapacity: number;
  waitAvailable: number;
}

export interface SeatStatus {
  tone: SeatTone;
  /** The word shown with the meter, e.g. "12 open" or "Full · waitlist 4/10". */
  label: string;
  enrolled: number;
  capacity: number;
}

/**
 * Applies the design's seat rules (handoff §3). Banner reports over-enrolled
 * sections with negative seats; those count as full, never as open.
 */
export function seatStatus(counts: SeatCounts): SeatStatus {
  const capacity = Math.max(0, counts.maximumEnrollment);
  const open = Math.max(0, counts.seatsAvailable);
  const enrolled = Math.min(capacity, Math.max(0, capacity - open));

  if (open >= FEW_SEATS_THRESHOLD) {
    return { tone: "success", label: `${open} open`, enrolled, capacity };
  }
  if (open > 0) {
    return { tone: "warning", label: `${open} left`, enrolled, capacity };
  }
  if (counts.waitAvailable > 0) {
    return {
      tone: "destructive",
      label: `Full · waitlist ${counts.waitCount}/${counts.waitCapacity}`,
      enrolled,
      capacity,
    };
  }
  return {
    tone: "muted",
    label: counts.waitCapacity > 0 ? "Closed · waitlist full" : "Closed",
    enrolled,
    capacity,
  };
}
