"use client";

import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  HardDriveIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { ButtonLink } from "@/components/button-link";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { templeTermName } from "@workspace/shared/lib/terms";
import type { BannerConnection } from "@workspace/shared/types/store";
import { firstReadyPath } from "@/components/shell/pages";
import {
  ProgramPicker,
  programLabel,
  useBulletinPrograms,
} from "@/features/program/program-picker";
import { Logo } from "@workspace/ui/components/logo";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { useSettings } from "@/hooks/use-settings";
import { useTerms, type Term } from "@/hooks/use-terms";
import { BANNER_REGISTRATION_URL, EXTENSION_INSTALL_URL } from "@/lib/config";

const STEPS = [
  { id: "term", label: "Term" },
  { id: "program", label: "Program" },
  { id: "banner", label: "Banner · optional" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function isStepId(value: string | null): value is StepId {
  return STEPS.some((s) => s.id === value);
}

/**
 * W1.2 · Guest onboarding: term, program, then an optional Banner
 * connection, as Settings has them. No account step.
 */
export function GetStartedPage() {
  // The step is in the query string, which only the browser knows; the
  // prerendered page shows the first step.
  return (
    <Suspense fallback={<GetStarted step="term" />}>
      <GetStartedFromUrl />
    </Suspense>
  );
}

function GetStartedFromUrl() {
  const step = useSearchParams().get("step");
  return <GetStarted step={isStepId(step) ? step : "term"} />;
}

function GetStarted({ step }: { step: StepId }) {
  const router = useRouter();
  const pathname = usePathname();
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const { settings, status, update } = useSettings();
  const terms = useTerms();
  const banner = useBannerConnection();

  // The term waits for Continue; the program step saves as it's picked, like Settings.
  const [draftTerm, setDraftTerm] = useState<string | null | undefined>();
  // Start from what's saved once it loads, so returning students can edit it.
  if (draftTerm === undefined && status !== "loading") {
    setDraftTerm(settings.term);
  }
  const term = draftTerm ?? null;

  function goTo(next: StepId) {
    router.push(next === "term" ? pathname : `${pathname}?step=${next}`);
  }

  async function saveTermAndContinue() {
    await update({ term });
    goTo("program");
  }

  return (
    <div className="min-h-dvh bg-sidebar text-sm text-foreground">
      <header className="mx-auto flex min-h-18 max-w-5xl items-center px-4 sm:px-8">
        <Link
          href="/"
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex max-w-5xl flex-wrap items-start gap-6 px-4 pt-6 pb-16 sm:px-8">
        <div className="flex min-w-0 grow-999 basis-120 flex-col gap-4">
          <ol aria-label="Setup steps" className="grid grid-cols-3 gap-1.5">
            {STEPS.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === stepIndex ? "step" : undefined}
                className={cn(
                  "flex flex-col gap-1.5 text-xs font-medium",
                  i <= stepIndex ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1 rounded-2xl",
                    i <= stepIndex ? "bg-primary" : "bg-border",
                  )}
                />
                {s.label}
              </li>
            ))}
          </ol>

          <Card className="gap-5 p-6" render={<section />}>
            {step === "term" && (
              <TermStep
                terms={terms}
                term={term}
                onTerm={setDraftTerm}
                onContinue={() => void saveTermAndContinue()}
              />
            )}
            {step === "program" && (
              <ProgramStep
                onBack={() => goTo("term")}
                onContinue={() => goTo("banner")}
              />
            )}
            {step === "banner" && (
              <BannerStep
                connection={banner.connection}
                extensionInstalled={banner.extensionInstalled}
                onBack={() => goTo("program")}
                onFinish={() => router.push(firstReadyPath())}
              />
            )}
          </Card>
        </div>

        <SetupSummary
          termName={terms.terms.find((t) => t.code === term)?.name}
          connection={banner.connection}
        />
      </main>
      <p className="px-4 pb-8 text-center text-xs text-muted-foreground">
        BetterSSB is an independent student project, not affiliated with
        Ellucian or Temple University.
      </p>
    </div>
  );
}

function StepHeading({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function TermStep({
  terms,
  term,
  onTerm,
  onContinue,
}: {
  terms: ReturnType<typeof useTerms>;
  term: string | null;
  onTerm: (term: string) => void;
  onContinue: () => void;
}) {
  const [showError, setShowError] = useState(false);
  const invalid = showError && !term;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!term) return setShowError(true);
        onContinue();
      }}
    >
      <StepHeading title="What are you planning?">
        BetterSSB is for Temple University students. No account needed, and you
        can switch terms any time from the top bar.
      </StepHeading>
      <FieldSet data-invalid={invalid}>
        <FieldLegend variant="label">Term</FieldLegend>
        <TermChoices
          terms={terms}
          value={term}
          invalid={invalid}
          onChange={(t) => {
            setShowError(false);
            onTerm(t);
          }}
        />
        {invalid && <FieldError>Choose a term to continue.</FieldError>}
      </FieldSet>
      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Continue
        </Button>
      </div>
    </form>
  );
}

function ProgramStep({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const chosen = useBulletinPrograms().selectedOption !== null;
  const [showError, setShowError] = useState(false);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!chosen) return setShowError(true);
        onContinue();
      }}
    >
      <StepHeading title="Where are you in your degree?">
        Your start term picks the Bulletin year your requirements come from, and
        your program is shared with the advisor only if you choose. You can
        change both later in Settings.
      </StepHeading>
      <ProgramPicker showRequirements={false} />
      {showError && !chosen && (
        <FieldError>Choose your start term and program to continue.</FieldError>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="lg">
          Continue
        </Button>
      </div>
    </form>
  );
}

function TermChoices({
  terms,
  value,
  invalid,
  onChange,
}: {
  terms: ReturnType<typeof useTerms>;
  value: string | null;
  invalid: boolean;
  onChange: (term: string) => void;
}) {
  if (terms.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading terms"
        className="flex flex-col gap-2"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (terms.status === "error") {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Couldn't load terms from Banner</AlertTitle>
        <AlertDescription>
          {terms.error.message} Reload the page to try again.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <RadioGroup
      aria-label="Term"
      aria-invalid={invalid}
      value={value ?? ""}
      onValueChange={(v) => typeof v === "string" && onChange(v)}
      className="gap-2"
    >
      {terms.terms.map((t: Term) => (
        <FieldLabel key={t.code} htmlFor={`term-${t.code}`}>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{t.name}</FieldTitle>
            </FieldContent>
            <RadioGroupItem value={t.code} id={`term-${t.code}`} />
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}

function StatusRow({
  done,
  title,
  description,
  action,
  dimmed,
}: {
  done: boolean;
  title: string;
  description: string;
  action?: ReactNode;
  dimmed?: boolean;
}) {
  const Icon = done ? CircleCheckIcon : CircleDashedIcon;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3.5 py-3 ring-1 ring-border ring-inset",
        dimmed && "opacity-60",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4.5 shrink-0",
          done ? "text-success" : "text-muted-foreground",
        )}
      />
      <span className="flex flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      {action}
    </li>
  );
}

function BannerStep({
  connection,
  extensionInstalled,
  onBack,
  onFinish,
}: {
  connection: BannerConnection | null;
  extensionInstalled: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  const connected = connection === "connected";
  return (
    <div className="flex flex-col gap-5">
      <StepHeading title="Connect Banner when you're ready">
        Optional, and you can connect later from Settings. Your degree audit,
        auto-register and Banner page overlays run through the Chrome extension,
        inside your own Banner tab. Your Banner login stays with Banner.
      </StepHeading>
      <ul className="flex flex-col gap-2">
        <StatusRow
          done={extensionInstalled}
          title={
            extensionInstalled ? "Extension installed" : "Chrome extension"
          }
          description={
            extensionInstalled
              ? "BetterSSB for Chrome is ready"
              : EXTENSION_INSTALL_URL
                ? "Free · works in Chrome, Edge, Brave and Arc"
                : "Not available to install yet"
          }
          action={
            !extensionInstalled &&
            EXTENSION_INSTALL_URL && (
              <ButtonLink
                variant="outline"
                size="sm"
                href={EXTENSION_INSTALL_URL}
              >
                Add to Chrome
              </ButtonLink>
            )
          }
        />
        <StatusRow
          done={connected}
          dimmed={!extensionInstalled}
          title={connected ? "Banner connected" : "Sign in to Banner once"}
          description={
            connected
              ? "Live data from your Banner session is on"
              : connection === "signed-out"
                ? "Banner signed you out. Sign in again in any tab."
                : "In a normal tab. The extension notices and connects."
          }
          action={
            extensionInstalled &&
            !connected && (
              <ButtonLink
                variant="outline"
                size="sm"
                href={BANNER_REGISTRATION_URL}
              >
                Open Banner
              </ButtonLink>
            )
          }
        />
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button type="button" size="lg" onClick={onFinish}>
          {connected ? "Start planning" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}

function SetupSummary({
  termName,
  connection,
}: {
  termName: string | undefined;
  connection: BannerConnection | null;
}) {
  // The program as the picker shows it, so one saved from another year's Bulletin reads as not chosen.
  const { settings, selectedOption } = useBulletinPrograms();
  const programName = selectedOption && programLabel(selectedOption);
  const startTermName = settings.startTerm
    ? templeTermName(settings.startTerm)
    : null;
  const rows: [string, string, boolean][] = [
    ["Term", termName ?? "Not chosen", !!termName],
    ["Started", startTermName ?? "Not chosen", !!startTermName],
    ["Program", programName ?? "Not chosen", !!programName],
    [
      "Banner",
      connection === "connected"
        ? "Connected"
        : connection === "signed-out"
          ? "Signed out"
          : "Not connected",
      connection === "connected",
    ],
    ["Account", "Not needed", false],
  ];
  return (
    <aside
      aria-labelledby="setup-heading"
      className="flex min-w-0 grow basis-70 flex-col gap-4 pt-5"
    >
      <Card className="gap-1 px-2 pt-4 pb-2" render={<section />}>
        <h2 id="setup-heading" className="px-3 pb-1.5 font-medium">
          Your setup
        </h2>
        <dl>
          {rows.map(([label, value, set]) => (
            <div
              key={label}
              className="flex min-h-9 items-center justify-between gap-3 rounded-xl px-3"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd
                className={cn(
                  "text-right font-medium",
                  !set && "text-muted-foreground",
                )}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="flex gap-2.5 rounded-3xl px-4 py-3.5 ring-1 ring-border ring-inset">
        <HardDriveIcon
          aria-hidden
          className="mt-0.5 size-4.5 shrink-0 text-muted-foreground"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Saved on this device</span>
          <span className="text-muted-foreground">
            Everything you set up is kept in this browser, or in the extension
            if you add it. Change any of it later in Settings.
          </span>
        </span>
      </div>
    </aside>
  );
}
