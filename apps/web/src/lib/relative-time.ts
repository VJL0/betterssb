const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const JUST_NOW = 45 * SECOND;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "2 minutes ago", "3 hours ago", or the time of day after a day. */
export function formatUpdated(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const elapsed = Math.max(0, now - then);
  if (elapsed < JUST_NOW) return "just now";
  if (elapsed < HOUR)
    return relative.format(-Math.round(elapsed / MINUTE), "minute");
  if (elapsed < 24 * HOUR)
    return relative.format(-Math.round(elapsed / HOUR), "hour");
  return new Date(then).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "2:14 PM", for "Results from 2:14 PM". */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
