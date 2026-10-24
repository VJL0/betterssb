"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleXIcon,
  FileUpIcon,
  GraduationCapIcon,
  InfoIcon,
  MessageCircleQuestionIcon,
  RefreshCwIcon,
} from "lucide-react";
import { queryError, type Audit } from "@workspace/api-client";
import {
  auditGroups,
  countLines,
  plannedOptions,
  type AuditGroup,
  type LineStatus,
} from "@workspace/shared/lib/audit-view";
import { creditTotals, formatCredits } from "@workspace/shared/lib/dars";
import {
  auditCourseKeys,
  projectedFinish,
  termEntries,
} from "@workspace/shared/lib/planner";
import type { TermPlan } from "@workspace/shared/types/store";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { isPageReady } from "@/components/shell/pages";
import { ButtonLink } from "@/components/button-link";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { usePlans } from "@/hooks/use-plans";
import { useStoreDocument } from "@/lib/store/store-context";
import { RequirementGroup } from "./requirement-group";
import { useAuditRun } from "./use-audit-run";

const DARS_URL = "https://prd-dars.temple.edu/selfservice/";
const ELAPSED_TICK_MS = 1_000;
const MS_PER_SECOND = 1_000;

type Filter = LineStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needed", label: "Needed" },
  { value: "progress", label: "In progress" },
  { value: "done", label: "Done" },
];

function shortDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** DARS writes "10/02/2026 05:14 PM"; fall back to when it was saved here. */
function runDate(audit: Audit, storedAt: string): string {
  return (
    shortDate(audit.preparedOn.split(" ")[0] ?? "") ??
    shortDate(storedAt) ??
    audit.preparedOn
  );
}

/** The term each planned course key is in, across every term plan. */
function plannedTermsOf(plans: readonly TermPlan[]): Map<string, string> {
  const terms = new Map<string, string>();
  for (const plan of plans) {
    for (const entry of termEntries(plan)) {
      if (entry.code) terms.set(entry.key, plan.termDescription);
    }
  }
  return terms;
}

function linesFor(group: AuditGroup, filter: Filter) {
  return filter === "all"
    ? group.lines
    : group.lines.filter((line) => line.status === filter);
}

/** W3.1 · Degree audit: the saved DARS audit, requirement by requirement. */
export function AuditPage() {
  const run = useAuditRun();
  const { extensionInstalled } = useBannerConnection();
  const fileInput = useRef<HTMLInputElement>(null);
  const audit = run.stored?.audit ?? null;

  const actions = (
    <>
      <Button
        variant="outline"
        onClick={() => fileInput.current?.click()}
        disabled={run.running}
      >
        <FileUpIcon data-icon="inline-start" />
        Upload DARS file
      </Button>
      {extensionInstalled && (
        <Button
          variant={audit ? "outline" : "default"}
          onClick={() => run.start({ kind: "extension" })}
          disabled={run.running}
        >
          <RefreshCwIcon data-icon="inline-start" />
          {audit ? "Re-run audit" : "Run audit"}
        </Button>
      )}
    </>
  );

  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      {/* Opened by "Upload DARS file"; hidden from tab order and screen readers. */}
      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,text/html"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) run.start({ kind: "file", file });
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Degree audit
          </h1>
          <p className="text-muted-foreground">
            {audit && run.stored
              ? [
                  audit.programTitle,
                  audit.catalogYear && `${audit.catalogYear} catalog`,
                  `DARS run ${runDate(audit, run.stored.storedAt)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "What's done, in progress and still needed for your degree"}
          </p>
        </div>
        {audit && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {run.running && (
        <Running label={run.runLabel} startedAt={run.startedAt} />
      )}
      {run.error && !run.running && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>The audit didn't update</AlertTitle>
          <AlertDescription>
            {queryError(run.error)?.message}
            {audit && " Your last saved audit is below."}
          </AlertDescription>
        </Alert>
      )}

      {run.loading ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : audit && run.stored ? (
        <AuditReport audit={audit} storedAt={run.stored.storedAt} />
      ) : (
        !run.running && (
          <NoAudit actions={actions} extensionInstalled={extensionInstalled} />
        )
      )}
    </div>
  );
}

function Running({ label, startedAt }: { label: string; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / MS_PER_SECOND));
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Spinner aria-hidden />
      <span role="status" className="flex flex-1 flex-col">
        {label}
        <span className="text-xs text-muted-foreground">
          DARS usually takes 5 to 20 seconds. If you're signed out, a DARS tab
          opens so you can sign in.
        </span>
      </span>
      <span aria-hidden className="text-muted-foreground tabular-nums">
        {seconds} s
      </span>
    </Card>
  );
}

function NoAudit({
  actions,
  extensionInstalled,
}: {
  actions: React.ReactNode;
  extensionInstalled: boolean;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GraduationCapIcon />
        </EmptyMedia>
        <EmptyTitle>See your degree audit</EmptyTitle>
        <EmptyDescription>
          {extensionInstalled
            ? "Run it in DARS with the extension, or upload a saved audit file."
            : "Upload the audit page you saved from DARS. With the BetterSSB extension, you can run it from here instead."}{" "}
          It's saved on this device for the planner and the advisor.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {actions}
      </EmptyContent>
      <details className="max-w-md text-left text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How do I save my audit?
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Open your audit in{" "}
            <a
              href={DARS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              DARS
            </a>{" "}
            and switch to the printer-friendly view.
          </li>
          <li>Save the page (⌘S or Ctrl+S) as an HTML file.</li>
          <li>Upload that file here.</li>
        </ol>
      </details>
    </Empty>
  );
}

function AuditReport({ audit, storedAt }: { audit: Audit; storedAt: string }) {
  const { plans } = usePlans();
  const transcript = useStoreDocument("transcript").value;
  const [filter, setFilter] = useState<Filter>("all");
  const groups = useMemo(() => auditGroups(audit), [audit]);
  const counts = countLines(groups);
  const totals = creditTotals(audit);
  const plannedTerms = useMemo(() => plannedTermsOf(plans), [plans]);
  const finish = totals
    ? projectedFinish(totals, plans, auditCourseKeys(audit))
    : null;
  const plannedKeys = new Set(plannedTerms.keys());
  const covered = groups
    .flatMap((g) => g.lines)
    .filter((l) => l.status === "needed")
    .flatMap((l) => plannedOptions(l, plannedKeys).slice(0, 1));
  const gpa = transcript?.transcript.gpa ?? null;

  return (
    <>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(13.75rem,100%),1fr))] gap-4">
        {totals && (
          <Stat
            label="Credits"
            value={formatCredits(totals.earned)}
            detail={`of ${formatCredits(totals.total)} · ${formatCredits(totals.inProgress)} in progress`}
          >
            <span
              aria-hidden
              className="flex h-2 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="bg-primary"
                style={{ width: `${(totals.earned / totals.total) * 100}%` }}
              />
              <span
                className="bg-primary/45"
                style={{
                  width: `${(totals.inProgress / totals.total) * 100}%`,
                }}
              />
            </span>
          </Stat>
        )}
        {gpa !== null && (
          <Stat
            label="GPA"
            value={gpa.toFixed(2)}
            detail="from your transcript"
          />
        )}
        <Stat
          label="Requirements met"
          value={String(counts.done)}
          detail={`of ${counts.all}`}
        >
          <span className="text-xs text-muted-foreground">
            {counts.progress} in progress
          </span>
        </Stat>
        {finish && (
          <Stat
            label="Projected finish"
            value={
              finish.onTrack
                ? (finish.lastTerm ?? "On track")
                : `${formatCredits(finish.shortBy)} cr`
            }
            detail={finish.onTrack ? undefined : "still to plan"}
          >
            {isPageReady("plan") && (
              <ButtonLink
                href="/plan"
                variant="link"
                size="xs"
                className="self-start px-0"
              >
                See the plan
              </ButtonLink>
            )}
          </Stat>
        )}
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as Filter)}
          className="gap-4"
        >
          <TabsList aria-label="Filter requirements" className="self-start">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {counts[f.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {FILTERS.map((f) => (
            <TabsContent
              key={f.value}
              value={f.value}
              className="flex flex-col gap-4"
            >
              {groups.map((group) => (
                <RequirementGroup
                  key={group.code}
                  group={group}
                  lines={linesFor(group, f.value)}
                  plannedTerms={plannedTerms}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>

        <aside className="flex flex-col gap-4">
          {covered.length > 0 && (
            <Alert variant="info">
              <InfoIcon />
              <AlertTitle>
                Your plan covers {covered.length} more{" "}
                {covered.length === 1 ? "requirement" : "requirements"}
              </AlertTitle>
              <AlertDescription>
                {covered.join(", ")} will count once you take{" "}
                {covered.length === 1 ? "it" : "them"}.
              </AlertDescription>
            </Alert>
          )}
          {isPageReady("advisor") && (
            <ButtonLink
              href="/advisor"
              className="h-auto justify-start gap-3 rounded-3xl p-4 text-left whitespace-normal"
            >
              <MessageCircleQuestionIcon data-icon="inline-start" />
              <span className="flex flex-col">
                <span className="font-medium">Ask about this audit</span>
                <span className="text-xs font-normal opacity-80">
                  The advisor can read it if you let it.
                </span>
              </span>
            </ButtonLink>
          )}
          <p className="text-xs text-muted-foreground">
            Saved on this device {shortDate(storedAt)}. DARS is the official
            record; check anything that matters with your advisor.
          </p>
        </aside>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 px-5 py-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-2">
        <span className="flex items-baseline gap-1.5 tabular-nums">
          <span className="text-3xl font-medium">{value}</span>
          {detail && <span className="text-muted-foreground">{detail}</span>}
        </span>
        {children}
      </dd>
    </Card>
  );
}
