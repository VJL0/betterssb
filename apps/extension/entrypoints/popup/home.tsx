import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import type { BannerConnection } from "@workspace/shared/types/store";
import { BANNER_REGISTRATION_URL } from "@/lib/temple-urls";
import {
  useAutoRegister,
  useBannerConnection,
} from "./hooks/use-auto-register";
import { openUrl, openWeb } from "./lib/open-web";
import { RequestList } from "./request-list";

const BANNER_STATUS: Record<
  BannerConnection,
  { label: string; dotClass: string }
> = {
  connected: { label: "Signed in to Banner", dotClass: "bg-success" },
  "signed-out": { label: "Signed out of Banner", dotClass: "bg-destructive" },
  "not-connected": { label: "Can't reach Banner", dotClass: "bg-warning" },
};

function runTime(iso: string): string {
  return new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * E1 The popup: what the extension is for, the two things only it can tell
 * (Banner sign-in and an armed run), the way to the website, and every
 * request it sent with the student's sign-in.
 */
export function Home() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">
        Uses your Banner sign-in to check seats and register for you.
      </p>
      <Status />
      <Button className="w-full" onClick={() => void openWeb("/search")}>
        Open BetterSSB
      </Button>
      <RequestList />
    </div>
  );
}

function Status() {
  const banner = useBannerConnection();
  const snapshot = useAutoRegister().data;
  const status = banner.data ? BANNER_STATUS[banner.data] : null;

  return (
    <Card render={<section />} className="gap-2 rounded-2xl p-4">
      {status ? (
        <p className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", status.dotClass)}
          />
          {status.label}
        </p>
      ) : (
        <Skeleton className="h-5 w-40" />
      )}
      {banner.data === "signed-out" && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => void openUrl(BANNER_REGISTRATION_URL)}
        >
          Sign in to Banner
        </Button>
      )}
      {snapshot?.armed && (
        <p className="text-muted-foreground">
          Auto-register set for {runTime(snapshot.scheduledRunAt)}
        </p>
      )}
    </Card>
  );
}
