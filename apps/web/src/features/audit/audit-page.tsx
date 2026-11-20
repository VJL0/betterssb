"use client";

import { useState } from "react";
import {
  GraduationCapIcon,
  InfoIcon,
  MessageCircleQuestionIcon,
} from "lucide-react";
import { parseAudit, type Audit } from "@workspace/api-client";
import {
  auditGroups,
  countLines,
  plannedOptions,
  type AuditGroup,
  type LineStatus,
} from "@workspace/shared/lib/audit-view";
import {
  creditTotals,
  formatCredits,
  creditsLabel,
} from "@workspace/shared/lib/dars";
import {
  auditCourseKeys,
  plannedTermByCourse,
  projectedFinish,
} from "@workspace/shared/lib/planner";
import type { StoredAudit } from "@workspace/shared/types/store";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { isPageReady } from "@/components/shell/pages";
import { ButtonLink } from "@/components/button-link";
import { runDarsAudit } from "@/lib/extension";
import { usePlans } from "@/hooks/use-plans";
import { useStoreDocument } from "@/lib/store/store-context";
import { RecordPage } from "@/features/records/record-page";
import {
  SignInRequiredError,
  useRecordRun,
  type RecordKind,
  type RecordReaders,
} from "@/features/records/use-record-run";
import { RequirementGroup } from "./requirement-group";

const DARS_URL = "https://prd-dars.temple.edu/selfservice/";

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

function linesFor(group: AuditGroup, filter: Filter) {
  return filter === "all"
    ? group.lines
    : group.lines.filter((line) => line.status === filter);
}

const AUDIT: RecordKind = {
  name: "degree audit",
  source: "DARS",
  fileName: "DARS file",
  accept: ".html,.htm,text/html",
  sourceHint: "DARS usually takes 5 to 20 seconds.",
};

/** Reads a printer-friendly DARS audit page, through the API. */
async function parseAuditPage(
  html: string,
  errorMessage: string,
): Promise<Audit> {
  const { data } = await parseAudit({ body: html, meta: { errorMessage } });
  return data;
}

async function runInDars(): Promise<Audit> {
  const lookup = await runDarsAudit();
  if (lookup.status === "signed-out") {
    throw new SignInRequiredError("DARS", DARS_URL);
  }
  return parseAuditPage(lookup.html, "Couldn't read the audit from DARS.");
}

const AUDIT_READERS: RecordReaders<Audit> = {
  fromExtension: runInDars,
  fromFile: async (file) =>
    parseAuditPage(
      await file.text(),
      "Couldn't read that file. Save the printer-friendly audit page as HTML and try again.",
    ),
};

function auditSummary({ audit, storedAt }: StoredAudit): string {
  return [
    audit.programTitle,
    audit.catalogYear && `${audit.catalogYear} Bulletin`,
    `DARS run ${runDate(audit, storedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AuditPage() {
  const stored = useStoreDocument("audit");
  const run = useRecordRun(AUDIT, AUDIT_READERS, (audit, storedAt) =>
    stored.save({ audit, storedAt }),
  );
  const saved = stored.value;

  return (
    <RecordPage
      kind={AUDIT}
      run={run}
      loading={stored.status === "loading"}
      hasRecord={!!saved}
      subtitle={saved && auditSummary(saved)}
      icon={<GraduationCapIcon />}
      help={
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
          <li>
            Save the page (⌘S or Ctrl+S) as an HTML file, then choose Upload
            DARS file.
          </li>
        </ol>
      }
    >
      {saved && <AuditReport audit={saved.audit} />}
    </RecordPage>
  );
}

function AuditReport({ audit }: { audit: Audit }) {
  const { plans } = usePlans();
  const transcript = useStoreDocument("transcript").value;
  const [filter, setFilter] = useState<Filter>("all");
  const groups = auditGroups(audit);
  const counts = countLines(groups);
  const totals = creditTotals(audit);
  const plannedTerms = plannedTermByCourse(
    plans,
    (plan) => plan.termDescription,
  );
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
                : `${creditsLabel(finish.shortBy)}`
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
              </span>
            </ButtonLink>
          )}
          <p className="text-xs text-muted-foreground">
            DARS is the official record.
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
