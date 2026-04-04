import { useEffect, useMemo, useState } from "react";
import { useStorage } from "@/hooks/useStorage";
import { sendMessage } from "@/lib/messaging";
import { setStorageItem } from "@/lib/storage";
import type {
  SSBGetPlansResponse,
  SSBRegPlanHeader,
  SSBTerm,
} from "@/types/ssb";
import { Button, Card, Input, Spinner } from "@/components/ui";
import type { AutoRegBatchResultRecord } from "@/lib/auto-reg-batch-result";
import { cn } from "@/lib/cn";

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
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        className={cn(
          "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none",
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

function mergeTermsFromPlans(terms: SSBTerm[], plans: SSBRegPlanHeader[]) {
  const byCode = new Map(terms.map((t) => [t.code, t]));
  for (const p of plans) {
    if (!byCode.has(p.term)) {
      byCode.set(p.term, { code: p.term, description: p.term });
    }
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}

function parseManualCrns(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function crnsFromPlanHeader(plan: SSBRegPlanHeader | null): string[] {
  if (!plan?.planCourses?.length) return [];
  return plan.planCourses
    .map((c) => String(c.courseReferenceNumber ?? "").trim())
    .filter((c) => c.length > 0);
}

function normalizeCrnList(raw: string): string {
  return parseManualCrns(raw).slice().sort().join(",");
}

export function AutoRegisterPage() {
  const [autoRegCrns, setAutoRegCrns] = useStorage("betterssb:autoRegCrns", "");
  const [regTime, setRegTime] = useStorage("betterssb:registrationTime", "");
  const [autoRegTerm, setAutoRegTerm, termStorageLoading] = useStorage(
    "betterssb:autoRegTerm",
    "",
  );
  const [autoRegPlanId, setAutoRegPlanId, planIdStorageLoading] = useStorage(
    "betterssb:autoRegPlanId",
    "",
  );
  const [manualMode, setManualMode, manualStorageLoading] = useStorage(
    "betterssb:autoRegManualMode",
    false,
  );
  const [activated, setActivated, activatedStorageLoading] = useStorage(
    "betterssb:autoRegActivated",
    false,
  );
  const [lastResultRaw] = useStorage("betterssb:autoRegLastResult", "");

  const [terms, setTerms] = useState<SSBTerm[]>([]);
  const [plansResponse, setPlansResponse] =
    useState<SSBGetPlansResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const locked = activated;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const [termsRes, plansRes] = await Promise.all([
          sendMessage({ type: "SSB_REG_GET_TERMS", payload: {} }),
          sendMessage({ type: "SSB_REG_GET_PLANS", payload: {} }),
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
    if (termStorageLoading || terms.length === 0) return;
    const ok = autoRegTerm && terms.some((t) => t.code === autoRegTerm);
    if (!ok) void setAutoRegTerm(terms[0].code);
  }, [termStorageLoading, terms, autoRegTerm, setAutoRegTerm]);

  const plansForTerm = useMemo(() => {
    if (!plansResponse?.plans?.length || !autoRegTerm) return [];
    return plansResponse.plans.filter((p) => p.term === autoRegTerm);
  }, [plansResponse, autoRegTerm]);

  useEffect(() => {
    if (planIdStorageLoading) return;
    if (plansForTerm.length === 0) {
      if (autoRegPlanId) void setAutoRegPlanId("");
      return;
    }
    const n = parseInt(autoRegPlanId, 10);
    const valid = plansForTerm.some((p) => p.id === n);
    if (!autoRegPlanId || !valid) {
      void setAutoRegPlanId(String(plansForTerm[0].id));
    }
  }, [planIdStorageLoading, plansForTerm, autoRegPlanId, setAutoRegPlanId]);

  const selectedPlan = useMemo(() => {
    const id = parseInt(autoRegPlanId, 10);
    if (Number.isNaN(id)) return null;
    return plansForTerm.find((p) => p.id === id) ?? null;
  }, [plansForTerm, autoRegPlanId]);

  const planCrns = useMemo(
    () => crnsFromPlanHeader(selectedPlan),
    [selectedPlan],
  );

  const lastBatchResult = useMemo((): AutoRegBatchResultRecord | null => {
    const raw = lastResultRaw.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AutoRegBatchResultRecord;
    } catch {
      return null;
    }
  }, [lastResultRaw]);

  useEffect(() => {
    if (locked || manualMode || !selectedPlan) return;
    const next = planCrns.join(", ");
    if (normalizeCrnList(next) !== normalizeCrnList(autoRegCrns)) {
      void setAutoRegCrns(next);
    }
  }, [locked, manualMode, selectedPlan, planCrns, autoRegCrns, setAutoRegCrns]);

  const storageReady =
    !termStorageLoading &&
    !planIdStorageLoading &&
    !manualStorageLoading &&
    !activatedStorageLoading;

  const manualCrnsOk = parseManualCrns(autoRegCrns).length > 0;
  const planModeOk =
    plansForTerm.length > 0 && selectedPlan !== null && planCrns.length > 0;
  const sectionsOk = manualMode ? manualCrnsOk : planModeOk;

  const runTimeOk = regTime.trim().length > 0;

  const canActivate =
    storageReady &&
    !dataLoading &&
    !loadError &&
    terms.length > 0 &&
    runTimeOk &&
    sectionsOk;

  async function handleActivate() {
    if (!canActivate || locked) return;
    if (!manualMode && selectedPlan) {
      const next = planCrns.join(", ");
      await setAutoRegCrns(next);
    }
    await setStorageItem("betterssb:autoRegAttemptedKey", "");
    await setActivated(true);
  }

  async function handleDeactivate() {
    await setActivated(false);
  }

  async function switchToManual() {
    if (locked) return;
    await setManualMode(true);
  }

  async function switchToPlan() {
    if (locked) return;
    await setManualMode(false);
  }

  const formDisabled = locked || !storageReady || dataLoading;

  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-gray-600">
        Pick a term and plan to load section CRNs automatically, or enter CRNs
        yourself. Set when the auto-register helper should run, then activate.
      </p>

      <Card title="Term &amp; plan">
        {dataLoading || !storageReady ? (
          <div className="flex items-center gap-2 py-3 text-sm text-gray-600">
            <Spinner />
            <span>Loading terms and plans…</span>
          </div>
        ) : loadError ? (
          <p className="text-sm text-amber-800">
            {loadError} Open{" "}
            <span className="font-medium">Register for Classes</span> on your
            school&apos;s site in a tab, then try again.
          </p>
        ) : terms.length === 0 ? (
          <p className="text-sm text-gray-600">
            No terms returned. Open registration in a browser tab and refresh
            this panel.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <FieldSelect
              label="Term"
              value={autoRegTerm}
              onChange={(v) => void setAutoRegTerm(v)}
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
              value={autoRegPlanId}
              onChange={(v) => void setAutoRegPlanId(v)}
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

            {!manualMode && !locked && (
              <p className="text-xs text-gray-600">
                CRNs update from the courses in this plan.
                {!planModeOk && selectedPlan && (
                  <span className="mt-1 block text-amber-800">
                    This plan has no sections yet—pick another plan or enter
                    CRNs manually.
                  </span>
                )}
              </p>
            )}

            {!locked && !manualMode && (
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
                  value={autoRegCrns}
                  onChange={(e) => void setAutoRegCrns(e.target.value)}
                  placeholder="12345, 67890"
                  disabled={formDisabled}
                />
                {!locked && (
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

            {locked && (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                <span className="font-medium">Armed: </span>
                {manualMode
                  ? `Manual CRNs (${parseManualCrns(autoRegCrns).length} sections)`
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
          value={regTime}
          onChange={(e) => void setRegTime(e.target.value)}
          disabled={formDisabled}
        />
        <p className="mt-1.5 text-xs text-gray-500">
          Reminders fire up to 5 minutes before. The batch POST runs once, on a
          one-shot alarm at this time (same endpoint as Banner&apos;s submit).
        </p>
      </Card>

      {lastBatchResult && (
        <Card title="Last batch result">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-xs text-gray-500">
              {new Date(lastBatchResult.at).toLocaleString()}
            </span>
            {lastBatchResult.ok ? (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                All registered
              </span>
            ) : lastBatchResult.error ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                Error
              </span>
            ) : (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                {lastBatchResult.registeredCount} registered,{" "}
                {lastBatchResult.failedCount} failed
              </span>
            )}
          </div>

          {lastBatchResult.error && (
            <p className="mb-2 text-xs text-red-700">
              {lastBatchResult.error}
            </p>
          )}

          {lastBatchResult.registeredHours && (
            <p className="mb-2 text-xs text-gray-600">
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
                      ? "border-green-200 bg-green-50 text-green-900"
                      : "border-red-200 bg-red-50 text-red-900",
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
        {!locked ? (
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
          !locked &&
          storageReady &&
          !dataLoading &&
          !loadError && (
            <p className="text-center text-xs text-gray-500">
              {!runTimeOk &&
                !sectionsOk &&
                "Set a run time and valid sections (plan or CRNs)."}
              {!runTimeOk && sectionsOk && "Set a run time."}
              {runTimeOk &&
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
