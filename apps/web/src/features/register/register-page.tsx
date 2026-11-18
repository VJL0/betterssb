"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import { CircleXIcon, ExternalLinkIcon, PuzzleIcon } from "lucide-react";
import { toast } from "sonner";
import { queryError, type ClassSection } from "@workspace/api-client";
import { armProblem } from "@workspace/shared/lib/auto-reg-queue";
import { splitCourseCode } from "@workspace/shared/lib/plan";
import { localDateTimeValue } from "@workspace/shared/lib/registration-time";
import { formatTermName } from "@workspace/shared/lib/terms";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
  CrnCheck,
  RegistrationTimeLookup,
} from "@workspace/shared/types/auto-reg";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import type { BannerConnection } from "@workspace/shared/types/store";
import {
  Alert,
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
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
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
import {
  BANNER_REGISTRATION_URL,
  EXTENSION_INSTALL_URL,
  TUPORTAL_URL,
} from "@/lib/config";
import type { PlanCourse } from "@/features/schedule/schedule-options";
import { useCourseSections } from "@/features/schedule/use-course-sections";
import { ArmPanel, type ArmCheck } from "./arm-panel";
import { LastRun } from "./last-run";
import { QueueCard } from "./queue-card";
import { queueRows, withLookedUp, type QueueRow } from "./queue-rows";
import {
  useAutoRegister,
  useBannerRegistration,
  useCrnChecks,
  useLookedUpSections,
  useRegistrationTime,
} from "./use-auto-register";
import { formatDateTime } from "@/lib/relative-time";

/** Arm-time checks only need to notice the submit time passing. */
const NOW_TICK_MS = 15_000;
const NO_BANNER_PLANS: SSBRegPlanHeader[] = [];

interface TermOption {
  code: string;
  name: string;
}

function PageHeading() {
  return (
    <h1 className="text-2xl font-semibold tracking-tight">Auto-register</h1>
  );
}

export function RegisterPage() {
  const banner = useBannerConnection();
  const auto = useAutoRegister(banner.extensionInstalled);

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      {!banner.extensionInstalled ? (
        <>
          <PageHeading />
          <NoExtension />
        </>
      ) : auto.snapshot.isError ? (
        <>
          <PageHeading />
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
          <PageHeading />
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
          It registers you with your own Banner sign-in, so it needs the
          BetterSSB extension in Chrome.
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

function bannerCheck(
  connection: BannerConnection | null,
  armed: boolean,
): ArmCheck {
  switch (connection) {
    case "connected":
      return {
        // While armed, the extension keeps Banner signed in until the run.
        label: armed
          ? "Signed in to Banner, kept signed in until then"
          : "Signed in to Banner",
        state: "ok",
      };
    case "signed-out":
      return {
        label: "Sign in to Banner",
        state: "bad",
        href: BANNER_REGISTRATION_URL,
      };
    case "not-connected":
      return { label: "Couldn't reach Banner", state: "bad" };
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
  if (count === 0) return { label: "No CRNs added", state: "bad" };
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
  const term = snapshot.term || currentTerm?.code || "";
  const registration = useBannerRegistration(connected, term);
  const bannerPlans = registration.plans.data?.plans ?? NO_BANNER_PLANS;
  const plannedRows = queueRows(snapshot.crns, term, plans, bannerPlans);
  const lookedUp = useLookedUpSections(
    term,
    plannedRows.filter((row) => row.title === null).map((row) => row.crn),
  );
  const rows = withLookedUp(plannedRows, lookedUp.byCrn);
  const sections = useCourseSections(term, coursesOf(rows));
  const sectionsByCrn = new Map<string, ClassSection>(
    [...sections.sectionsByCourse.values()]
      .flat()
      .map((s) => [s.courseReferenceNumber, s]),
  );
  const crnChecks = useCrnChecks(
    term,
    snapshot.crns,
    connected && !snapshot.armed,
  );
  const queue: AutoRegQueue = {
    term,
    crns: snapshot.crns,
    scheduledRunAt: snapshot.scheduledRunAt,
  };

  function save(patch: Partial<AutoRegQueue>) {
    auto.save.mutate(
      { ...queue, ...patch },
      {
        onError: (error) =>
          toast.error(
            queryError(error)?.message ?? "Couldn't save your classes.",
          ),
      },
    );
  }

  const registrationTime = useRegistrationTime(term, !snapshot.armed);
  usePrefilledRunAt(snapshot, term, registrationTime.data, (scheduledRunAt) =>
    save({ scheduledRunAt }),
  );

  const termOptions: TermOption[] = registration.terms.data
    ? registration.terms.data.map((t) => ({
        code: t.code,
        name: formatTermName(t.description),
      }))
    : proxyTerms.terms;
  const termName =
    termOptions.find((t) => t.code === term)?.name ?? currentTerm?.name ?? term;
  const notFound = new Set([
    ...lookedUp.missing,
    ...(crnChecks.data ?? [])
      .filter((c) => c.found === false)
      .map((c) => c.crn),
  ]);
  const planCrns = plans
    .filter((p) => p.term === term)
    .flatMap((p) => p.sections.map((s) => s.crn));

  const canArm = connected && armProblem(queue, now) === null;

  const termOpen = registration.terms.data?.some((t) => t.code === term);
  const checks: ArmCheck[] = [
    bannerCheck(connection, snapshot.armed),
    !term
      ? { label: "No term chosen", state: "bad" }
      : !connected || !registration.terms.data
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
      ? { label: "No registration time set", state: "bad" }
      : new Date(snapshot.scheduledRunAt).getTime() <= now
        ? { label: "That time has passed", state: "bad" }
        : { label: "Registration time set", state: "ok" },
    { label: "Keep Chrome open and the computer awake", state: "warn" },
  ];

  const pending = auto.arm.isPending || auto.disarm.isPending;
  const armError = queryError(auto.arm.error);

  return (
    <>
      <PageHeading />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <ArmPanel
            armed={snapshot.armed}
            scheduledRunAt={snapshot.scheduledRunAt}
            crnCount={snapshot.crns.length}
            checks={checks}
            canArm={canArm}
            pending={pending}
            onArm={() => auto.arm.mutateAsync().catch(() => undefined)}
            onDisarm={() => auto.disarm.mutateAsync().catch(() => undefined)}
          />
          {armError && (
            <Alert variant="destructive">
              <CircleXIcon />
              <AlertTitle>Auto-register didn't turn on</AlertTitle>
              <AlertDescription>{armError.message}</AlertDescription>
            </Alert>
          )}
          <QueueCard
            rows={rows}
            armed={snapshot.armed}
            sectionsByCrn={sectionsByCrn}
            lookingUp={lookedUp.pending}
            notFound={notFound}
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
          registrationTime={registrationTime.data}
          armed={snapshot.armed}
          onTerm={(code) => save({ term: code })}
          onRunAt={(scheduledRunAt) => save({ scheduledRunAt })}
        />
      </div>
    </>
  );
}

/** Whether two `datetime-local` values name the same moment ("07:00" and "07:00:00" do). */
function sameMoment(a: string, b: string): boolean {
  return !!b && new Date(a).getTime() === new Date(b).getTime();
}

/** The registration time TUportal lists, as a `datetime-local` value, or null. */
function portalRunAt(
  lookup: RegistrationTimeLookup | undefined,
): string | null {
  return lookup?.status === "found"
    ? localDateTimeValue(lookup.startsAt)
    : null;
}

/**
 * Fills an empty submit time with the TUportal registration time, once per
 * term, when that time is still ahead. A time the student set is left alone.
 */
function usePrefilledRunAt(
  { armed, scheduledRunAt }: AutoRegSnapshot,
  term: string,
  lookup: RegistrationTimeLookup | undefined,
  onRunAt: (value: string) => void,
) {
  const filledFor = useRef<string | null>(null);
  const fill = useEffectEvent(onRunAt);
  const detected = portalRunAt(lookup);

  useEffect(() => {
    if (!detected || armed || scheduledRunAt || filledFor.current === term) {
      return;
    }
    if (new Date(detected).getTime() <= Date.now()) return;
    filledFor.current = term;
    fill(detected);
  }, [detected, armed, scheduledRunAt, term]);
}

function RunAtDescription({
  scheduledRunAt,
  registrationTime,
  armed,
  onRunAt,
}: {
  scheduledRunAt: string;
  registrationTime: RegistrationTimeLookup | undefined;
  armed: boolean;
  onRunAt: (value: string) => void;
}) {
  const detected = portalRunAt(registrationTime);
  if (detected && sameMoment(detected, scheduledRunAt)) {
    return (
      <FieldDescription>Your registration time from TUportal.</FieldDescription>
    );
  }
  if (detected) {
    return (
      <FieldDescription>
        TUportal says your registration time is {formatDateTime(detected)}.{" "}
        {!armed && (
          <Button
            variant="link"
            size="xs"
            className="px-0"
            onClick={() => onRunAt(detected)}
          >
            Use this time
          </Button>
        )}
      </FieldDescription>
    );
  }
  if (registrationTime?.status === "signed-out") {
    return (
      <FieldDescription>
        <a href={TUPORTAL_URL} target="_blank" rel="noreferrer">
          Sign in to TUportal
        </a>{" "}
        to fill this in.
      </FieldDescription>
    );
  }
  return <FieldDescription>Find it in TUportal.</FieldDescription>;
}

function RunSettings({
  term,
  termOptions,
  scheduledRunAt,
  registrationTime,
  armed,
  onTerm,
  onRunAt,
}: {
  term: string;
  termOptions: readonly TermOption[];
  scheduledRunAt: string;
  registrationTime: RegistrationTimeLookup | undefined;
  armed: boolean;
  onTerm: (code: string) => void;
  onRunAt: (value: string) => void;
}) {
  const ids = useId();
  const items = termOptions.map((t) => ({ value: t.code, label: t.name }));
  return (
    <Card
      aria-labelledby={`${ids}-heading`}
      className="gap-4 p-5"
      render={<aside />}
    >
      <h2 id={`${ids}-heading`} className="text-base font-medium">
        When to register
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
        <FieldLabel htmlFor={`${ids}-at`}>Register at</FieldLabel>
        <Input
          id={`${ids}-at`}
          type="datetime-local"
          step={1}
          value={scheduledRunAt}
          disabled={armed}
          onChange={(e) => onRunAt(e.target.value)}
        />
        <RunAtDescription
          scheduledRunAt={scheduledRunAt}
          registrationTime={registrationTime}
          armed={armed}
          onRunAt={onRunAt}
        />
      </Field>
      <p className="rounded-2xl bg-muted/50 p-3 text-xs text-foreground/70">
        It registers once and doesn't retry or swap in backups.
      </p>
    </Card>
  );
}
