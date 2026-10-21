import { useEffect, useRef } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import type { Ratings, RatingsStatus as Status } from "@/hooks/use-ratings";

/** Ratings fill in all over the page at once, so say so once they're in. */
function useArrivalToast(status: Status) {
  const waited = useRef(false);
  useEffect(() => {
    if (status !== "ready") {
      waited.current = true;
    } else if (waited.current) {
      waited.current = false;
      toast.success("Instructor ratings are in");
    }
  }, [status]);
}

/**
 * One line on how instructor ratings are doing while the API fetches them for
 * the first time; empty once they're in. It stays mounted, so screen readers
 * hear each change.
 */
export function RatingsStatus({
  ratings,
  className,
}: {
  ratings: Pick<Ratings, "status" | "retry">;
  className?: string;
}) {
  useArrivalToast(ratings.status);

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm empty:hidden",
        className,
      )}
    >
      {ratings.status === "syncing" && (
        <>
          <Spinner
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          {/* One run of text, so a narrow screen wraps it like a sentence. */}
          <span className="min-w-0 flex-1 sm:flex-none">
            Loading instructor ratings.{" "}
            <span className="text-muted-foreground">
              The first load takes about a minute.
            </span>
          </span>
        </>
      )}
      {ratings.status === "unavailable" && (
        <>
          <TriangleAlertIcon aria-hidden className="size-3.5 text-warning" />
          <span>Instructor ratings didn't load</span>
          <Button variant="outline" size="xs" onClick={ratings.retry}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
