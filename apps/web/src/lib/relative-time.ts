/** "Nov 15", for "Saved Nov 15". */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

/** "2:14 PM", for "Seats as of 2:14 PM". */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
