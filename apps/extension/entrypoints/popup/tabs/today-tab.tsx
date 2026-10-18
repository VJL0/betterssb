import { useEffect, useState } from "react";
import {
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  GlobeIcon,
} from "lucide-react";
import { countdown } from "@workspace/shared/lib/auto-reg-queue";
import { formatTimeRange } from "@workspace/shared/lib/meeting-times";
import {
  emptyPlan,
  planConflicts,
  planCourseColor,
  planCredits,
} from "@workspace/shared/lib/plan";
import { planKey } from "@workspace/shared/lib/store";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import type { PlannedSection } from "@workspace/shared/types/store";
import { Button } from "@workspace/ui/components/button";
import { CourseDot } from "@workspace/ui/components/course-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { BANNER_REGISTRATION_URL } from "@/lib/config";
import { useOnBannerPage } from "../hooks/use-active-tab";
import {
  useAutoRegister,
  useBannerConnection,
} from "../hooks/use-auto-register";
import type { Term } from "../hooks/use-current-term";
import { usePlanSeats } from "../hooks/use-plan-seats";
import { useStoreDocument } from "../hooks/use-store-document";
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

function meets(section: PlannedSection): string {
  const timed = section.meetings.filter((m) => m.start !== null && m.days);
  if (timed.length === 0) return "No set time";
  return timed
    .map((m) => `${m.days} ${formatTimeRange(m.start!, m.end!)}`)
    .join(" · ");
}

function Card({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      className={
        dark
          ? "flex flex-col gap-2 rounded-2xl bg-primary p-4 text-primary-foreground"
          : "flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-foreground/5"
      }
    >
      {children}
    </section>
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
    <Card dark>
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
    </Card>
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
        <Card>
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
        </Card>
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
        <Card>
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
        </Card>
      )}

      {onBanner.data === false && (
        <Card>
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
        </Card>
      )}
      {onBanner.data === true && (
        <p className="rounded-2xl bg-muted/60 px-3 py-2 text-xs">
          <span className="font-medium">On this tab:</span>{" "}
          {banner.data === "signed-out"
            ? "Banner, signed out"
            : "Banner registration"}
        </p>
      )}

      {term ? (
        <PlanCard term={term} onSearch={() => onOpenTab("search")} />
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}
    </div>
  );
}

function PlanCard({ term, onSearch }: { term: Term; onSearch: () => void }) {
  const doc = useStoreDocument(planKey(term.code));
  const plan = doc.value ?? emptyPlan(term.code, term.name);
  const seats = usePlanSeats(term.code, plan.sections);
  const conflicts = planConflicts(plan.sections).length;

  if (!doc.loaded) return <Skeleton className="h-40 rounded-2xl" />;

  return (
    <Card>
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
                      {meets(section)}
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
    </Card>
  );
}
