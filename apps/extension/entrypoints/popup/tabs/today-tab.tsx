import { useEffect, useId, useState } from "react";
import {
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  GlobeIcon,
} from "lucide-react";
import { countdown } from "@workspace/shared/lib/auto-reg-queue";
import {
  describeMeetings,
  emptyPlan,
  planConflicts,
  planCourseColor,
  planCredits,
} from "@workspace/shared/lib/plan";
import { planKey, withSettingDefaults } from "@workspace/shared/lib/store";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { CourseDot } from "@workspace/ui/components/course-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import { BANNER_REGISTRATION_URL } from "@/lib/config";
import { useOnBannerPage, useOverlayStatus } from "../hooks/use-active-tab";
import {
  useAutoRegister,
  useBannerConnection,
} from "../hooks/use-auto-register";
import type { Term } from "../hooks/use-current-term";
import { usePlanSeats } from "../hooks/use-plan-seats";
import { useStoreDocument } from "@/hooks/use-store-document";
import { openUrl, openWeb } from "../lib/open-web";

const TICK_MS = 1_000;
/** A result this recent is "right after the run". */
const RECENT_RUN_MS = 24 * 60 * 60 * 1000;

function shortTime(iso: string, withDate = false): string {
  return new Date(iso).toLocaleString("en", {
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    ...(withDate ? { second: "2-digit" } : {}),
  });
}

function Panel({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <Card
      render={<section />}
      className={cn(
        "gap-2 rounded-2xl p-4",
        dark && "bg-primary text-primary-foreground shadow-none ring-0",
      )}
    >
      {children}
    </Card>
  );
}

function Armed({
  snapshot,
  onViewQueue,
  onDisarm,
  disarming,
}: {
  snapshot: AutoRegSnapshot;
  onViewQueue: () => void;
  onDisarm: () => void;
  disarming: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const left = countdown(new Date(snapshot.scheduledRunAt).getTime(), now);
  const crns = snapshot.crns.length;
  return (
    <Panel dark>
      <h2 className="flex items-center gap-2 text-xs font-medium">
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        Armed · {shortTime(snapshot.scheduledRunAt, true)}
      </h2>
      <p aria-hidden className="text-3xl font-medium tabular-nums">
        {left ?? "Submitting…"}
      </p>
      <p className="text-xs text-primary-foreground/80">
        {crns} {crns === 1 ? "CRN" : "CRNs"} queued · keep this computer awake
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onViewQueue}>
          View queue
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
          onClick={onDisarm}
          disabled={disarming}
        >
          Disarm
        </Button>
      </div>
    </Panel>
  );
}

/** E1.2 Today: what's armed, this tab, and the term's plan. */
export function TodayTab({
  term,
  onOpenTab,
}: {
  term: Term | null;
  onOpenTab: (tab: "search" | "register") => void;
}) {
  const auto = useAutoRegister();
  const banner = useBannerConnection();
  const onBanner = useOnBannerPage();
  const snapshot = auto.snapshot.data;
  const lastRun = snapshot?.lastResult;
  const [loadedAt] = useState(() => Date.now());
  const ranRecently =
    !!lastRun && loadedAt - new Date(lastRun.at).getTime() < RECENT_RUN_MS;

  return (
    <div className="flex flex-col gap-3">
      {snapshot?.armed && banner.data === "signed-out" && (
        <Panel>
          <h2 className="flex items-center gap-2 font-medium text-destructive">
            <CircleXIcon aria-hidden className="size-4" />
            Banner signed you out
          </h2>
          <p className="text-muted-foreground">
            Auto-register is still armed but can't submit until you sign back
            in. Your queue is safe.
          </p>
          <Button
            size="sm"
            className="self-start"
            onClick={() => void openUrl(BANNER_REGISTRATION_URL)}
          >
            Sign in to Banner
          </Button>
        </Panel>
      )}
      {snapshot?.armed && (
        <Armed
          snapshot={snapshot}
          onViewQueue={() => onOpenTab("register")}
          onDisarm={() => auto.disarm.mutate()}
          disarming={auto.disarm.isPending}
        />
      )}
      {!snapshot?.armed && lastRun && ranRecently && (
        <Panel>
          <h2 className="flex items-center gap-2 font-medium">
            <CircleCheckIcon
              aria-hidden
              className={
                lastRun.ok ? "size-4 text-success" : "size-4 text-warning"
              }
            />
            {lastRun.registeredCount + lastRun.failedCount > 0
              ? `${lastRun.registeredCount} of ${lastRun.registeredCount + lastRun.failedCount} registered`
              : lastRun.summary || "Auto-register ran"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {shortTime(lastRun.at, true)}
            {lastRun.registeredHours &&
              ` · ${lastRun.registeredHours} credit hours`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => onOpenTab("register")}
          >
            See results
          </Button>
        </Panel>
      )}

      {onBanner.data === false && (
        <Panel>
          <h2 className="flex items-center gap-2 font-medium">
            <GlobeIcon aria-hidden className="size-4" />
            Open Banner registration
          </h2>
          <p className="text-muted-foreground">
            Auto-register submits through your school's Banner registration
            page, signed in, in a tab like this one.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => void openUrl(BANNER_REGISTRATION_URL)}
          >
            Open Temple Banner
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        </Panel>
      )}
      {onBanner.data === true && (
        <BannerTabCard signedOut={banner.data === "signed-out"} />
      )}

      {term ? (
        <PlanCard term={term} onSearch={() => onOpenTab("search")} />
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}
    </div>
  );
}

function enhancedSummary(sections: number, inPlan: number): string {
  const enhanced = `${sections} ${sections === 1 ? "section" : "sections"} enhanced`;
  if (inPlan === 0) return enhanced;
  return `${enhanced} · ${inPlan} ${inPlan === 1 ? "is" : "are"} in your plan`;
}

/** The Banner tab under the popup, and the one switch for the page overlay. */
function BannerTabCard({ signedOut }: { signedOut: boolean }) {
  const settings = useStoreDocument("settings");
  const status = useOverlayStatus(true);
  const switchId = useId();
  const current = withSettingDefaults(settings.value);
  const sections = status.data?.sections ?? 0;

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-3 py-2.5 text-xs">
      <p>
        <span className="font-medium">On this tab:</span>{" "}
        {signedOut
          ? "Banner, signed out"
          : sections > 0
            ? "Banner class search"
            : "Banner registration"}
      </p>
      {current.bannerOverlay && sections > 0 && (
        <p className="text-foreground/70">
          {enhancedSummary(sections, status.data?.inPlan ?? 0)}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={switchId} className="font-medium">
          Ratings and seats on Banner pages
        </label>
        <Switch
          id={switchId}
          size="sm"
          checked={current.bannerOverlay}
          disabled={!settings.loaded}
          onCheckedChange={(bannerOverlay) =>
            void settings
              .save({
                ...current,
                bannerOverlay,
                updatedAt: new Date().toISOString(),
              })
              .then(() => status.refetch())
          }
        />
      </div>
    </section>
  );
}

function PlanCard({ term, onSearch }: { term: Term; onSearch: () => void }) {
  const doc = useStoreDocument(planKey(term.code));
  const plan = doc.value ?? emptyPlan(term.code, term.name);
  const seats = usePlanSeats(term.code, plan.sections);
  const conflicts = planConflicts(plan.sections).length;

  if (!doc.loaded) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{term.name} plan</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {planCredits(plan)} cr
          {plan.sections.length > 0 &&
            ` · ${conflicts === 0 ? "no conflicts" : `${conflicts} ${conflicts === 1 ? "conflict" : "conflicts"}`}`}
        </span>
      </div>
      {plan.sections.length === 0 ? (
        <>
          <p className="text-muted-foreground">
            Nothing planned for {term.name} yet.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={onSearch}
          >
            Search sections
          </Button>
        </>
      ) : (
        <>
          <ul className="flex flex-col divide-y">
            {plan.sections.map((section) => {
              const color = planCourseColor(plan, section.courseId);
              const live = seats.byCrn.get(section.crn);
              return (
                <li key={section.crn} className="flex items-start gap-2 py-2">
                  {color && <CourseDot color={color} className="mt-1.5" />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">
                      {section.courseCode} · {section.section}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {describeMeetings(section)}
                    </span>
                  </span>
                  <span className="w-24 shrink-0">
                    {live ? (
                      <SeatMeter {...live} size="sm" />
                    ) : seats.loading ? (
                      <Skeleton className="h-4 w-20" />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {seats.fetchedAt && (
            <p className="text-xs text-muted-foreground">
              Seats from {shortTime(seats.fetchedAt)}
            </p>
          )}
        </>
      )}
      <Button
        size="sm"
        variant="link"
        className="self-start px-0"
        onClick={() => void openWeb("/plan")}
      >
        Open full plan in BetterSSB
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </Panel>
  );
}
