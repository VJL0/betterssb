import type { RequestLogEntry } from "@workspace/shared/types/store";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { useStoreDocument } from "@/hooks/use-store-document";
import { API_ORIGIN } from "@/lib/config";
import { BANNER_ORIGIN, DARS_ORIGIN, TUPORTAL_ORIGIN } from "@/lib/temple-urls";

const SITE_NAMES: Record<string, string> = {
  [new URL(API_ORIGIN).origin]: "BetterSSB",
  [BANNER_ORIGIN]: "Banner",
  [DARS_ORIGIN]: "DARS",
  [TUPORTAL_ORIGIN]: "TUportal",
};

const HTTP_ERROR_FROM = 400;

function siteName(url: URL): string {
  return SITE_NAMES[url.origin] ?? url.host;
}

/** "getSectionDetailsFromCRN", the part of the path that says what was asked. */
function endpoint(url: URL): string {
  return url.pathname.split("/").filter(Boolean).at(-1) ?? url.pathname;
}

function statusLabel(status: number | null): string {
  if (status === null) return "Failed";
  // Banner redirects a signed-out session to sign-in, which isn't followed.
  if (status === 0) return "Redirected";
  return String(status);
}

function isProblem(status: number | null): boolean {
  return status === null || status === 0 || status >= HTTP_ERROR_FROM;
}

/** "2:14 PM", "Nov 13, 2:14 PM" before today, and "· 31 times" for a repeated request. */
function whenSent(entry: RequestLogEntry, now: Date): string {
  const sent = new Date(entry.at);
  const time = sent.toLocaleString("en", {
    ...(sent.toDateString() === now.toDateString()
      ? {}
      : { month: "short", day: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
  return entry.count ? `${time} · ${entry.count} times` : time;
}

/** Every request the extension sent, newest first. */
export function RequestList() {
  const log = useStoreDocument("requestLog");
  const entries = log.value?.entries ?? [];
  const now = new Date();

  return (
    <section aria-labelledby="requests-heading" className="flex flex-col gap-1">
      <h2 id="requests-heading" className="font-medium">
        Requests sent by BetterSSB
      </h2>
      {!log.loaded ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">No requests yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-2xl bg-card px-3 text-xs">
          {entries.map((entry) => {
            const url = new URL(entry.url);
            return (
              <li
                key={entry.at + entry.method + entry.url}
                title={`${entry.method} ${entry.url}`}
                className="flex flex-col gap-0.5 py-2"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono font-medium">{entry.method}</span>
                  <span className="min-w-0 grow truncate">{endpoint(url)}</span>
                  <span
                    className={cn(
                      "shrink-0 font-mono",
                      isProblem(entry.status)
                        ? "text-destructive"
                        : "text-success",
                    )}
                  >
                    {statusLabel(entry.status)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {siteName(url)} · {whenSent(entry, now)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
