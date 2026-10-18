import { useId, useMemo, useRef } from "react";
import { CircleXIcon, ExternalLinkIcon, PuzzleIcon } from "lucide-react";
import { toast } from "sonner";
import { queryError, type ClassSection } from "@workspace/api-client";
import { armProblem } from "@workspace/shared/lib/auto-reg-queue";
import { splitCourseCode } from "@workspace/shared/lib/plan";
import { formatTermName } from "@workspace/shared/lib/terms";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
  CrnCheck,
} from "@workspace/shared/types/auto-reg";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import type { BannerConnection } from "@workspace/shared/types/store";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { ButtonLink } from "@/components/button-link";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { useNow } from "@/hooks/use-now";
import { usePlans } from "@/hooks/use-plans";
import { useTerms } from "@/hooks/use-terms";
import { BANNER_REGISTRATION_URL, EXTENSION_INSTALL_URL } from "@/lib/config";
import type { PlanCourse } from "@/features/schedule/schedule-options";
import { useCourseSections } from "@/features/schedule/use-course-sections";
import { ArmPanel, formatRunAt, type ArmCheck } from "./arm-panel";
import { LastRun } from "./last-run";
import { QueueCard } from "./queue-card";
import { queueRows, type QueueRow } from "./queue-rows";
import {
  useAutoRegister,
  useBannerRegistration,
  useCrnChecks,
} from "./use-auto-register";

/** Arm-time checks only need to notice the submit time passing. */
const NOW_TICK_MS = 15_000;
const NO_BANNER_PLANS: SSBRegPlanHeader[] = [];

interface TermOption {
  code: string;
  name: string;
}

function PageHeading({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Auto-register</h1>
      <p className="text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** W4.1 · Auto-register: a CRN queue the extension submits when the window opens. */
export function RegisterPage() {
  const banner = useBannerConnection();
  const auto = useAutoRegister(banner.extensionInstalled);

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      <title>Auto-register · BetterSSB</title>
      {!banner.extensionInstalled ? (
        <>
          <PageHeading subtitle="Registers you the second your window opens" />
          <NoExtension />
        </>
      ) : auto.snapshot.isError ? (
        <>
          <PageHeading subtitle="Registers you the second your window opens" />
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Couldn't reach the extension</AlertTitle>
            <AlertDescription>
              {queryError(auto.snapshot.error)?.message} Reload the page to try
              again.
            </AlertDescription>
          </Alert>
        </>
      ) : auto.snapshot.data ? (
        <AutoRegister
          snapshot={auto.snapshot.data}
          connection={banner.connection}
          auto={auto}
        />
      ) : (
        <>
          <PageHeading subtitle="Loading your queue…" />
          <Skeleton className="h-96 rounded-3xl" />
        </>
      )}
    </div>
  );
}

function NoExtension() {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PuzzleIcon />
        </EmptyMedia>
        <EmptyTitle>Auto-register runs from the extension</EmptyTitle>
        <EmptyDescription>
          It submits your CRNs through your own signed-in Banner tab, so it
          needs the BetterSSB extension in Chrome on this computer. Your queue
          stays in this browser.
        </EmptyDescription>
      </EmptyHeader>
      {EXTENSION_INSTALL_URL && (
        <EmptyContent>
          <ButtonLink href={EXTENSION_INSTALL_URL}>
            Get the extension
            <ExternalLinkIcon data-icon="inline-end" />
          </ButtonLink>
        </EmptyContent>
      )}
    </Empty>
  );
}

/** Courses with a code, for looking up their live sections and seats. */
function coursesOf(rows: readonly QueueRow[]): PlanCourse[] {
  const courses = new Map<string, PlanCourse>();
  for (const row of rows) {
    const parts = row.code ? splitCourseCode(row.code) : null;
    if (!row.courseId || !row.code || !parts || courses.has(row.courseId)) {
      continue;
    }
    courses.set(row.courseId, {
      courseId: row.courseId,
      code: row.code,
      ...parts,
      title: row.title ?? "",
      credits: row.credits,
      plannedCrns: [],
      plannedSections: [],
    });
  }
  return [...courses.values()];
}

function bannerCheck(connection: BannerConnection | null): ArmCheck {
  switch (connection) {
    case "connected":
      return { label: "Banner tab open and signed in", state: "ok" };
    case "signed-out":
      return { label: "Sign in to Banner in your open tab", state: "bad" };
    case "not-connected":
      return { label: "Open Banner registration in a tab", state: "bad" };
    default:
      return { label: "Checking Banner…", state: "pending" };
  }
}

function crnCheck(
  count: number,
  connected: boolean,
  checks: readonly CrnCheck[] | undefined,
  checking: boolean,
): ArmCheck {
  if (count === 0) return { label: "No CRNs queued", state: "bad" };
  if (!connected) return { label: "CRNs not checked yet", state: "pending" };
  if (checking || !checks) {
    return { label: "Checking CRNs with Banner…", state: "pending" };
  }
  const found = checks.filter((c) => c.found === true).length;
  if (checks.some((c) => c.found === false)) {
    return { label: `${found} of ${count} CRNs found in Banner`, state: "bad" };
  }
  if (checks.some((c) => c.found === null)) {
    return { label: "Couldn't check every CRN with Banner", state: "warn" };
  }
  return { label: `${count} of ${count} CRNs found in Banner`, state: "ok" };
}

function AutoRegister({
  snapshot,
  connection,
  auto,
}: {
  snapshot: AutoRegSnapshot;
  connection: BannerConnection | null;
  auto: ReturnType<typeof useAutoRegister>;
}) {
  const { term: currentTerm } = useCurrentTerm();
  const proxyTerms = useTerms();
  const { plans } = usePlans();
  const now = useNow(NOW_TICK_MS);
  const crnInput = useRef<HTMLInputElement>(null);
  const connected = connection === "connected";
  const registration = useBannerRegistration(connected);

  const term = snapshot.term || currentTerm?.code || "";
  const bannerPlans = registration.plans.data?.plans ?? NO_BANNER_PLANS;
  const rows = useMemo(
    () => queueRows(snapshot.crns, term, plans, bannerPlans),
    [snapshot.crns, term, plans, bannerPlans],
  );
  const courses = useMemo(() => coursesOf(rows), [rows]);
  const sections = useCourseSections(term, courses);
  const sectionsByCrn = useMemo(
    () =>
      new Map<string, ClassSection>(
        [...sections.sectionsByCourse.values()]
          .flat()
          .map((s) => [s.courseReferenceNumber, s]),
      ),
    [sections.sectionsByCourse],
  );
  const crnChecks = useCrnChecks(
    term,
    snapshot.crns,
    connected && !snapshot.armed,
  );

  const termOptions: TermOption[] = registration.terms.data
    ? registration.terms.data.map((t) => ({
        code: t.code,
        name: formatTermName(t.description),
      }))
    : proxyTerms.terms;
  const termName =
    termOptions.find((t) => t.code === term)?.name ?? currentTerm?.name ?? term;
  const planCrns = plans
    .filter((p) => p.term === term)
    .flatMap((p) => p.sections.map((s) => s.crn));

  const queue: AutoRegQueue = {
    term,
    crns: snapshot.crns,
    scheduledRunAt: snapshot.scheduledRunAt,
  };
  const queueProblem = armProblem(queue, now);
  const blocker = !connected
    ? "Can't arm yet: auto-register submits through your Banner tab, so open Banner registration and sign in."
    : queueProblem;

  const termOpen = registration.terms.data?.some((t) => t.code === term);
  const checks: ArmCheck[] = [
    bannerCheck(connection),
    !connected || !registration.terms.data
      ? { label: "Term not checked yet", state: "pending" }
      : termOpen
        ? { label: `${termName} is open for registration`, state: "ok" }
        : {
            label: `${termName} isn't open for registration in Banner`,
            state: "bad",
          },
    crnCheck(
      snapshot.crns.length,
      connected,
      crnChecks.data,
      crnChecks.isFetching,
    ),
    !snapshot.scheduledRunAt
      ? { label: "No submit time set", state: "bad" }
      : new Date(snapshot.scheduledRunAt).getTime() <= now
        ? { label: "The submit time has passed", state: "bad" }
        : {
            label: `Submits ${formatRunAt(snapshot.scheduledRunAt)}`,
            state: "ok",
          },
    { label: "Keep Chrome open and the computer awake", state: "warn" },
  ];

  function save(patch: Partial<AutoRegQueue>) {
    auto.save.mutate(
      { ...queue, ...patch },
      {
        onError: (error) =>
          toast.error(queryError(error)?.message ?? "Couldn't save the queue."),
      },
    );
  }

  const subtitle = snapshot.scheduledRunAt
    ? `${termName} · submits ${formatRunAt(snapshot.scheduledRunAt)}`
    : `${termName} · set when your registration window opens`;
  const pending = auto.arm.isPending || auto.disarm.isPending;
  const armError = queryError(auto.arm.error);

  return (
    <>
      <PageHeading subtitle={subtitle} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <ArmPanel
            armed={snapshot.armed}
            scheduledRunAt={snapshot.scheduledRunAt}
            crnCount={snapshot.crns.length}
            checks={checks}
            blocker={blocker}
            pending={pending}
            onArm={() => auto.arm.mutateAsync().catch(() => undefined)}
            onDisarm={() => auto.disarm.mutateAsync().catch(() => undefined)}
          />
          {armError && (
            <Alert variant="destructive">
              <CircleXIcon />
              <AlertTitle>Auto-register isn't armed</AlertTitle>
              <AlertDescription>{armError.message}</AlertDescription>
            </Alert>
          )}
          {!connected && !snapshot.armed && connection !== null && (
            <Alert variant="warning">
              <CircleXIcon />
              <AlertTitle>
                {connection === "signed-out"
                  ? "Can't arm: Banner is signed out"
                  : "Can't arm: no Banner tab is open"}
              </AlertTitle>
              <AlertDescription>
                Auto-register submits through your own signed-in Banner tab.
                Open Banner registration and keep the tab open until it runs.
              </AlertDescription>
              <AlertAction>
                <ButtonLink
                  href={BANNER_REGISTRATION_URL}
                  variant="outline"
                  size="sm"
                >
                  Open Banner
                </ButtonLink>
              </AlertAction>
            </Alert>
          )}
          <QueueCard
            rows={rows}
            armed={snapshot.armed}
            sectionsByCrn={sectionsByCrn}
            checks={crnChecks.data ?? []}
            planCrns={planCrns}
            termName={termName}
            bannerPlans={bannerPlans}
            crnInput={crnInput}
            onChange={(crns) => save({ crns })}
          />
          {snapshot.lastResult && <LastRun result={snapshot.lastResult} />}
        </div>

        <RunSettings
          term={term}
          termOptions={termOptions}
          scheduledRunAt={snapshot.scheduledRunAt}
          armed={snapshot.armed}
          onTerm={(code) => save({ term: code })}
          onRunAt={(scheduledRunAt) => save({ scheduledRunAt })}
        />
      </div>
    </>
  );
}

function RunSettings({
  term,
  termOptions,
  scheduledRunAt,
  armed,
  onTerm,
  onRunAt,
}: {
  term: string;
  termOptions: readonly TermOption[];
  scheduledRunAt: string;
  armed: boolean;
  onTerm: (code: string) => void;
  onRunAt: (value: string) => void;
}) {
  const ids = useId();
  const items = termOptions.map((t) => ({ value: t.code, label: t.name }));
  return (
    <aside
      aria-labelledby={`${ids}-heading`}
      className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5"
    >
      <h2 id={`${ids}-heading`} className="text-base font-medium">
        Run settings
      </h2>
      <Field>
        <FieldLabel htmlFor={`${ids}-term`}>Term</FieldLabel>
        <Select
          items={items}
          value={term || null}
          disabled={armed}
          onValueChange={(code) => code && onTerm(code as string)}
        >
          <SelectTrigger id={`${ids}-term`} className="w-full">
            <SelectValue placeholder="Choose a term" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${ids}-at`}>Submit at</FieldLabel>
        <Input
          id={`${ids}-at`}
          type="datetime-local"
          step={1}
          value={scheduledRunAt}
          disabled={armed}
          onChange={(e) => onRunAt(e.target.value)}
        />
        <FieldDescription>
          The moment your registration window opens, from your registration
          status in Banner, in this computer's time zone.
        </FieldDescription>
      </Field>
      <p className="rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
        The queue and the armed state live in the extension in this browser. It
        runs once, in your Banner tab, and doesn't retry or swap in backups.
      </p>
    </aside>
  );
}
