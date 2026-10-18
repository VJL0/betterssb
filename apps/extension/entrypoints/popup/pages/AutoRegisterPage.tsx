import { useEffect, useMemo, useState } from "react";
import { useAutoRegRunState } from "@/hooks/useAutoRegRunState";
import { useAutoRegScheduleConfig } from "@/hooks/useAutoRegScheduleConfig";
import {
  crnsFromPlanHeader,
  findPlanById,
  getPlansForTerm,
  hasScheduledRunAt,
  isPlanModeSectionsOk,
  mergeTermsFromPlans,
  normalizeCrnList,
  parseAutoRegBatchResultJson,
  parseManualCrns,
  resolvePlanIdToValid,
  resolveTermCodeToValid,
} from "@workspace/shared/lib/auto-reg-helpers";
import { getPlans, getTerms } from "@/lib/ssb-reg-messages";
import type { SSBGetPlansResponse, SSBTerm } from "@workspace/shared/types/ssb";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { cn } from "@workspace/ui/lib/utils";

function FieldSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        className={cn(
          "rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function AutoRegisterPage() {
  const [scheduleConfig, updateScheduleConfig, scheduleConfigLoading] =
    useAutoRegScheduleConfig();
  const [runState, updateRunState, runStateLoading] = useAutoRegRunState();
  const {
    term: selectedTermCode,
    crns: crnsCsv,
    scheduledRunAt,
    planId: selectedPlanId,
    manualMode,
  } = scheduleConfig;
  const { armed, lastBatchResultJson } = runState;

  const [terms, setTerms] = useState<SSBTerm[]>([]);
  const [plansResponse, setPlansResponse] =
    useState<SSBGetPlansResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const [termsRes, plansRes] = await Promise.all([
          getTerms(),
          getPlans(),
        ]);
        if (cancelled) return;

        if (!termsRes.success && !plansRes.success) {
          setLoadError(
            termsRes.error ??
              plansRes.error ??
              "Could not load registration data.",
          );
          setTerms([]);
          setPlansResponse(null);
          return;
        }

        const rawTerms =
          termsRes.success && Array.isArray(termsRes.data)
            ? (termsRes.data as SSBTerm[])
            : [];
        const plansPayload =
          plansRes.success && plansRes.data
            ? (plansRes.data as SSBGetPlansResponse)
            : null;

        setPlansResponse(plansPayload);
        const merged = mergeTermsFromPlans(rawTerms, plansPayload?.plans ?? []);
        setTerms(merged);
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error
              ? e.message
              : "Could not load registration data.",
          );
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scheduleConfigLoading || terms.length === 0) return;
    const next = resolveTermCodeToValid(selectedTermCode, terms);
    if (next !== selectedTermCode) void updateScheduleConfig({ term: next });
  }, [scheduleConfigLoading, terms, selectedTermCode, updateScheduleConfig]);

  const plansForTerm = useMemo(
    () => getPlansForTerm(plansResponse?.plans, selectedTermCode),
    [plansResponse, selectedTermCode],
  );

  useEffect(() => {
    if (scheduleConfigLoading) return;
    const next = resolvePlanIdToValid(selectedPlanId, plansForTerm);
    if (next !== selectedPlanId) void updateScheduleConfig({ planId: next });
  }, [
    scheduleConfigLoading,
    plansForTerm,
    selectedPlanId,
    updateScheduleConfig,
  ]);

  const selectedPlan = useMemo(
    () => findPlanById(plansForTerm, selectedPlanId),
    [plansForTerm, selectedPlanId],
  );

  const planCrns = useMemo(
    () => crnsFromPlanHeader(selectedPlan),
    [selectedPlan],
  );

  const lastBatchResult = useMemo(
    () => parseAutoRegBatchResultJson(lastBatchResultJson),
    [lastBatchResultJson],
  );

  useEffect(() => {
    if (armed || manualMode || !selectedPlan) return;
    const next = planCrns.join(", ");
    if (normalizeCrnList(next) !== normalizeCrnList(crnsCsv)) {
      void updateScheduleConfig({ crns: next });
    }
  }, [
    armed,
    manualMode,
    selectedPlan,
    planCrns,
    crnsCsv,
    updateScheduleConfig,
  ]);

  const storageReady = !scheduleConfigLoading && !runStateLoading;

  const manualCrnsOk = parseManualCrns(crnsCsv).length > 0;
  const planModeOk = isPlanModeSectionsOk(plansForTerm, selectedPlan, planCrns);
  const sectionsOk = manualMode ? manualCrnsOk : planModeOk;

  const scheduledRunAtOk = hasScheduledRunAt(scheduledRunAt);

  const canActivate =
    storageReady &&
    !dataLoading &&
    !loadError &&
    terms.length > 0 &&
    scheduledRunAtOk &&
    sectionsOk;

  async function handleActivate() {
    if (!canActivate || armed) return;
    if (!manualMode && selectedPlan) {
      const next = planCrns.join(", ");
      await updateScheduleConfig({ crns: next });
    }
    await updateRunState({ dedupeRunKey: "", armed: true });
  }

  async function handleDeactivate() {
    await updateRunState({ armed: false });
  }

  async function switchToManual() {
    if (armed) return;
    await updateScheduleConfig({ manualMode: true });
  }

  async function switchToPlan() {
    if (armed) return;
    await updateScheduleConfig({ manualMode: false });
  }

  const formDisabled = armed || !storageReady || dataLoading;

  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-muted-foreground">
        Pick a term and plan to load section CRNs automatically, or enter CRNs
        yourself. Set when the auto-register helper should run, then activate.
      </p>

      <Card title="Term &amp; plan">
        {dataLoading || !storageReady ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Spinner />
            <span>Loading terms and plans…</span>
          </div>
        ) : loadError ? (
          <p className="text-sm text-warning">
            {loadError} Open{" "}
            <span className="font-medium">Register for Classes</span> on your
            school&apos;s site in a tab, then try again.
          </p>
        ) : terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No terms returned. Open registration in a browser tab and refresh
            this panel.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <FieldSelect
              label="Term"
              value={selectedTermCode}
              onChange={(v) => void updateScheduleConfig({ term: v })}
              disabled={formDisabled}
            >
              {terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.description || t.code}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect
              label="Plan"
              value={selectedPlanId}
              onChange={(v) => void updateScheduleConfig({ planId: v })}
              disabled={formDisabled || plansForTerm.length === 0 || manualMode}
            >
              {plansForTerm.length === 0 ? (
                <option value="">No plan for this term</option>
              ) : (
                plansForTerm.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.description || `Plan ${p.id}`}
                  </option>
                ))
              )}
            </FieldSelect>

            {!manualMode && !armed && (
              <p className="text-xs text-muted-foreground">
                CRNs update from the courses in this plan.
                {!planModeOk && selectedPlan && (
                  <span className="mt-1 block text-warning">
                    This plan has no sections yet—pick another plan or enter
                    CRNs manually.
                  </span>
                )}
              </p>
            )}

            {!armed && !manualMode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void switchToManual()}
                className="self-start pl-0"
              >
                Enter CRNs manually instead
              </Button>
            )}

            {manualMode && (
              <>
                <Input
                  label="CRNs (comma-separated)"
                  value={crnsCsv}
                  onChange={(e) =>
                    void updateScheduleConfig({ crns: e.target.value })
                  }
                  placeholder="12345, 67890"
                  disabled={formDisabled}
                />
                {!armed && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void switchToPlan()}
                    className="self-start pl-0"
                  >
                    Use term &amp; plan instead
                  </Button>
                )}
              </>
            )}

            {armed && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
                <span className="font-medium">Armed: </span>
                {manualMode
                  ? `Manual CRNs (${parseManualCrns(crnsCsv).length} sections)`
                  : selectedPlan
                    ? `${selectedPlan.description || "Plan"} — ${planCrns.length} section(s)`
                    : "—"}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card title="Run time">
        <Input
          label="When to run auto-register"
          type="datetime-local"
          value={scheduledRunAt}
          onChange={(e) =>
            void updateScheduleConfig({ scheduledRunAt: e.target.value })
          }
          disabled={formDisabled}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Reminders fire up to 5 minutes before. The batch POST runs once, on a
          one-shot alarm at this time (same endpoint as Banner&apos;s submit).
        </p>
      </Card>

      {lastBatchResult && (
        <Card title="Last batch result">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">
              {new Date(lastBatchResult.at).toLocaleString()}
            </span>
            {lastBatchResult.ok ? (
              <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
                All registered
              </span>
            ) : lastBatchResult.error ? (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                Error
              </span>
            ) : (
              <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
                {lastBatchResult.registeredCount} registered,{" "}
                {lastBatchResult.failedCount} failed
              </span>
            )}
          </div>

          {lastBatchResult.error && (
            <p className="mb-2 text-xs text-destructive">
              {lastBatchResult.error}
            </p>
          )}

          {lastBatchResult.registeredHours && (
            <p className="mb-2 text-xs text-muted-foreground">
              {lastBatchResult.registeredHours} credit hrs registered
              {lastBatchResult.billingHours
                ? ` · ${lastBatchResult.billingHours} billing hrs`
                : ""}
            </p>
          )}

          {lastBatchResult.crnResults.length > 0 && (
            <div className="space-y-1.5">
              {lastBatchResult.crnResults.map((r, i) => (
                <div
                  key={`${i}-${r.crn}`}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs",
                    r.ok
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  <span className="font-medium">
                    {r.label || `CRN ${r.crn}`}
                  </span>
                  <span className="mx-1.5 text-xs opacity-60">
                    {r.ok ? "OK" : "FAIL"}
                  </span>
                  <span className="text-xs opacity-80">{r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="mt-1 flex flex-col gap-2">
        {!armed ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!canActivate}
            onClick={() => void handleActivate()}
            className="w-full"
          >
            Activate
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            size="lg"
            onClick={() => void handleDeactivate()}
            className="w-full"
          >
            Deactivate
          </Button>
        )}
        {!canActivate &&
          !armed &&
          storageReady &&
          !dataLoading &&
          !loadError && (
            <p className="text-center text-xs text-muted-foreground">
              {!scheduledRunAtOk &&
                !sectionsOk &&
                "Set a run time and valid sections (plan or CRNs)."}
              {!scheduledRunAtOk && sectionsOk && "Set a run time."}
              {scheduledRunAtOk &&
                !sectionsOk &&
                (manualMode
                  ? "Enter at least one CRN."
                  : "Select a plan that includes sections, or switch to manual CRNs.")}
            </p>
          )}
      </div>
    </div>
  );
}
