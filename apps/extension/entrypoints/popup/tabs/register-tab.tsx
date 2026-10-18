import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import type { TermPlan } from "@workspace/shared/types/store";
import { planKey } from "@workspace/shared/lib/store";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { BANNER_REGISTRATION_URL } from "@/lib/config";
import {
  useAutoRegister,
  useBannerConnection,
} from "../hooks/use-auto-register";
import { useStoreDocument } from "@/hooks/use-store-document";
import { openUrl, openWeb } from "../lib/open-web";

const BANNER_WORDS = {
  connected: "Open and signed in",
  "signed-out": "Signed out",
  "not-connected": "Not open",
} as const;

function when(value: string): string {
  return new Date(value).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sectionLabel(plan: TermPlan | null, crn: string): string | null {
  const section = plan?.sections.find((s) => s.crn === crn);
  return section ? `${section.courseCode} · ${section.section}` : null;
}

/** E1.4 Register: the last run and the queue, read-only; arming is on the website. */
export function RegisterTab() {
  const auto = useAutoRegister();
  const banner = useBannerConnection();
  const snapshot = auto.snapshot.data;
  const plan = useStoreDocument(planKey(snapshot?.term ?? "")).value;
  const [picked, setView] = useState<string | null>(null);

  if (auto.snapshot.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (!snapshot) {
    return (
      <p className="text-destructive">
        {auto.snapshot.error?.message ?? "Couldn't load auto-register."}
      </p>
    );
  }
  const result = snapshot.lastResult;
  // The last run first, when there is one.
  const view = picked ?? (result ? "results" : "queue");

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={view} onValueChange={(v) => setView(v as string)}>
        <TabsList aria-label="Auto-register" className="self-start">
          <TabsTrigger value="results" disabled={!result}>
            Last run
          </TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="flex flex-col gap-2">
          {result && (
            <Card className="gap-0 rounded-2xl p-3" render={<section />}>
              <h2 className="font-medium">
                {result.registeredCount + result.failedCount > 0
                  ? `${result.registeredCount} of ${result.registeredCount + result.failedCount} registered`
                  : result.summary || "Auto-register ran"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {when(result.at)}
                {result.registeredHours && ` · ${result.registeredHours} cr`}
              </p>
              {result.error && (
                <p className="mt-1 text-xs text-destructive">{result.error}</p>
              )}
              <ul className="mt-2 flex flex-col divide-y">
                {result.crnResults.map((line) => (
                  <li key={line.crn} className="flex flex-col gap-1 py-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {sectionLabel(plan, line.crn) ?? line.label ?? line.crn}
                      </span>
                      <StatusBadge tone={line.ok ? "success" : "destructive"}>
                        {line.ok ? "Registered" : "Not registered"}
                      </StatusBadge>
                    </span>
                    {!line.ok && line.detail && (
                      <span className="text-xs text-muted-foreground">
                        {line.detail}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void openUrl(BANNER_REGISTRATION_URL)}
              >
                Open in Banner
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="queue" className="flex flex-col gap-2">
          {snapshot.crns.length === 0 ? (
            <Card
              className="gap-0 rounded-2xl p-3 text-muted-foreground"
              render={<p />}
            >
              No sections queued yet. Set up the queue in BetterSSB.
            </Card>
          ) : (
            <Card
              className="gap-0 divide-y rounded-2xl px-3 py-0"
              render={<ol />}
            >
              {snapshot.crns.map((crn, i) => (
                <li key={crn} className="flex items-center gap-3 py-2">
                  <span className="w-4 text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {sectionLabel(plan, crn) ?? `CRN ${crn}`}
                    </span>
                    {sectionLabel(plan, crn) && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        CRN {crn}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </Card>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-1 text-xs">
            <dt className="text-muted-foreground">Submits</dt>
            <dd>
              {snapshot.scheduledRunAt
                ? when(snapshot.scheduledRunAt)
                : "Not set"}
              {snapshot.armed && " · armed"}
            </dd>
            <dt className="text-muted-foreground">Banner tab</dt>
            <dd>{banner.data ? BANNER_WORDS[banner.data] : "Checking…"}</dd>
          </dl>
        </TabsContent>
      </Tabs>

      <Button onClick={() => void openWeb("/register")}>
        {snapshot.armed ? "Manage in BetterSSB" : "Arm in BetterSSB"}
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}
