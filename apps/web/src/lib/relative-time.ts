/** "2:14 PM", for "Seats as of 2:14 PM". */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
