import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { parseAudit, queryError } from "@workspace/api-client";
import {
  auditGroups,
  countLines,
  courseOptions,
} from "@workspace/shared/lib/audit-view";
import { creditTotals, formatCredits } from "@workspace/shared/lib/dars";
import { courseKey } from "@workspace/shared/lib/plan";
import { termEntries } from "@workspace/shared/lib/planner";
import type { TermPlan } from "@workspace/shared/types/store";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { usePlans } from "../hooks/use-plans";
import { useStoreDocument } from "@/hooks/use-store-document";
import { askBackground } from "@/lib/ask-background";
import { openWeb } from "../lib/open-web";

/** The popup lists the first few; the website has the rest. */
const NEEDED_SHOWN = 5;
const TICK_MS = 1_000;
const MS_PER_SECOND = 1_000;

/** Runs the audit in DARS (the background drives the DARS tab), then parses it. */
async function runAudit() {
  const { html } = await askBackground<{ html?: string }>("DARS_RUN_AUDIT");
  if (!html) throw new Error("The audit failed.");
  const { data } = await parseAudit({
    body: html,
    meta: { errorMessage: "Couldn't read the audit." },
  });
  return data;
}

function plannedKeys(plans: readonly (TermPlan | null)[]): Set<string> {
  return new Set(
    plans.flatMap((p) => (p ? termEntries(p).map((e) => e.key) : [])),
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return <>{Math.round((now - since) / MS_PER_SECOND)}s</>;
}

/** E1.5 Audit: the saved audit's summary and what's still needed. */
export function AuditTab() {
  const stored = useStoreDocument("audit");
  const transcript = useStoreDocument("transcript").value;
  const plans = usePlans();
  const run = useMutation({
    mutationFn: runAudit,
    onSuccess: (audit) =>
      stored.save({ audit, storedAt: new Date().toISOString() }),
  });

  if (!stored.loaded) return <Skeleton className="h-64 rounded-2xl" />;
  const audit = stored.value?.audit ?? null;

  const runButton = (
    <Button
      size="sm"
      variant={audit ? "outline" : "default"}
      onClick={() => run.mutate()}
      disabled={run.isPending}
    >
      {run.isPending ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <RefreshCwIcon data-icon="inline-start" />
      )}
      {run.isPending ? (
        <span>
          Running… <Elapsed since={run.submittedAt} />
        </span>
      ) : audit ? (
        "Re-run"
      ) : (
        "Run audit"
      )}
    </Button>
  );
  const error = run.isError && (
    <p className="text-destructive">{queryError(run.error)?.message}</p>
  );

  if (!audit) {
    return (
      <Card className="items-start gap-3 rounded-2xl p-4">
        <h2 className="font-medium">No degree audit yet</h2>
        <p className="text-muted-foreground">
          Run it in DARS from here. If you're signed out, a DARS tab opens so
          you can sign in.
        </p>
        {runButton}
        {error}
      </Card>
    );
  }

  const groups = auditGroups(audit);
  const counts = countLines(groups);
  const totals = creditTotals(audit);
  const planned = plannedKeys(plans);
  const needed = groups
    .flatMap((g) => g.lines)
    .filter((l) => l.status === "needed");
  const gpa = transcript?.transcript.gpa ?? null;

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-3 rounded-2xl p-3" render={<section />}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate font-medium">{audit.programTitle}</h2>
            <p className="text-xs text-muted-foreground">
              {run.isPending
                ? "Running your audit in DARS…"
                : `DARS run ${audit.preparedOn.split(" ")[0]}`}
            </p>
          </div>
          {runButton}
        </div>
        {error}
        <dl className="grid grid-cols-3 gap-2">
          {totals && (
            <Stat
              label="Credits"
              value={formatCredits(totals.earned)}
              of={formatCredits(totals.total)}
            />
          )}
          <Stat
            label="Met"
            value={String(counts.done)}
            of={String(counts.all)}
          />
          {gpa !== null && <Stat label="GPA" value={gpa.toFixed(2)} />}
        </dl>
      </Card>

      <Card className="gap-0 rounded-2xl p-3" render={<section />}>
        <h2 className="flex items-baseline justify-between font-medium">
          Still needed
          <span className="text-xs font-normal text-muted-foreground">
            {needed.length}{" "}
            {needed.length === 1 ? "requirement" : "requirements"}
          </span>
        </h2>
        <ul className="mt-1 flex flex-col divide-y">
          {needed.slice(0, NEEDED_SHOWN).map((line) => {
            const options = courseOptions(line.options);
            const isPlanned = options.some((o) => planned.has(courseKey(o)));
            return (
              <li key={line.id} className="flex items-center gap-2 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{line.title}</span>
                  {options.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">
                      {options.slice(0, 3).join(", ")}
                    </span>
                  )}
                </span>
                {isPlanned && (
                  <span className="text-xs font-medium text-info">Planned</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={() => void openWeb("/audit")}
      >
        Open full audit
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  of,
}: {
  label: string;
  value: string;
  of?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/50 px-2.5 py-2">
      <dt className="text-xs text-foreground/70">{label}</dt>
      <dd className="tabular-nums">
        <span className="text-lg font-medium">{value}</span>
        {of && <span className="text-xs text-foreground/70"> /{of}</span>}
      </dd>
    </div>
  );
}
