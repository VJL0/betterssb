import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  HardDriveIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type {
  BannerConnection,
  SchoolChoice,
} from "@workspace/shared/types/store";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { ButtonLink } from "@/components/button-link";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group";
import { SearchCombobox } from "@workspace/ui/components/search-combobox";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { firstReadyPath } from "@/app/pages";
import { Logo } from "@workspace/ui/components/logo";
import { useBannerConnection } from "@/hooks/use-banner-connection";
import { useSettings } from "@/hooks/use-settings";
import { useTerms, type Term } from "@/hooks/use-terms";
import { findSchools } from "@/lib/schools";
import { BANNER_REGISTRATION_URL, EXTENSION_INSTALL_URL } from "@/lib/config";

const STEPS = [
  { id: "school", label: "School" },
  { id: "term", label: "Term" },
  { id: "banner", label: "Banner · optional" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function isStepId(value: string | null): value is StepId {
  return STEPS.some((s) => s.id === value);
}

interface Draft {
  school: SchoolChoice | null;
  term: string | null;
  major: string;
}

/** W1.2 · Guest onboarding: school, term, then an optional Banner connection. No account step. */
export function GetStartedPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const step: StepId = isStepId(params.get("step"))
    ? (params.get("step") as StepId)
    : "school";
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const { settings, status, update } = useSettings();
  const terms = useTerms();
  const banner = useBannerConnection();

  const [draft, setDraft] = useState<Draft | null>(null);
  // Start from what's saved once it loads, so returning students can edit it.
  if (draft === null && status !== "loading") {
    setDraft({
      school: settings.school,
      term: settings.term,
      major: settings.major,
    });
  }
  const current: Draft = draft ?? { school: null, term: null, major: "" };

  function goTo(next: StepId) {
    setParams(next === "school" ? {} : { step: next });
  }

  async function saveAndGo(next: StepId | "done") {
    await update(current);
    if (next === "done") navigate(firstReadyPath());
    else goTo(next);
  }

  return (
    <div className="min-h-dvh bg-sidebar text-sm text-foreground">
      <title>Get started · BetterSSB</title>
      <header className="mx-auto flex min-h-18 max-w-5xl items-center px-4 sm:px-8">
        <Link
          to="/"
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex max-w-5xl flex-wrap items-start gap-6 px-4 pt-6 pb-16 sm:px-8">
        <div className="flex min-w-0 flex-[999_1_30rem] flex-col gap-4">
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

          <section className="flex flex-col gap-5 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-foreground/5">
            {step === "school" && (
              <SchoolStep
                school={current.school}
                onChange={(school) => setDraft({ ...current, school })}
                onContinue={() => void saveAndGo("term")}
              />
            )}
            {step === "term" && (
              <TermStep
                terms={terms}
                term={current.term}
                major={current.major}
                onTerm={(term) => setDraft({ ...current, term })}
                onMajor={(major) => setDraft({ ...current, major })}
                onBack={() => goTo("school")}
                onContinue={() => void saveAndGo("banner")}
              />
            )}
            {step === "banner" && (
              <BannerStep
                connection={banner.connection}
                extensionInstalled={banner.extensionInstalled}
                onBack={() => goTo("term")}
                onFinish={() => void saveAndGo("done")}
              />
            )}
          </section>
        </div>

        <SetupSummary
          draft={current}
          termName={terms.terms.find((t) => t.code === current.term)?.name}
          connection={banner.connection}
        />
      </main>
      <p className="px-4 pb-8 text-center text-xs text-muted-foreground">
        BetterSSB is an independent student project, not affiliated with
        Ellucian or your school.
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

function SchoolStep({
  school,
  onChange,
  onContinue,
}: {
  school: SchoolChoice | null;
  onChange: (school: SchoolChoice) => void;
  onContinue: () => void;
}) {
  const [showError, setShowError] = useState(false);
  const invalid = showError && !school;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!school) return setShowError(true);
        onContinue();
      }}
    >
      <StepHeading title="Which school do you go to?">
        No account needed. Your choice is saved in this browser.
      </StepHeading>
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="school">School</FieldLabel>
        <SearchCombobox<SchoolChoice>
          id="school"
          value={school}
          onSelect={(s) => {
            setShowError(false);
            onChange({ id: s.id, name: s.name });
          }}
          search={findSchools}
          itemKey={(s) => s.id}
          itemLabel={(s) => s.name}
          placeholder="Search schools"
          noun="schools"
          aria-invalid={invalid}
        />
        {invalid ? (
          <FieldError>Choose your school to continue.</FieldError>
        ) : (
          <FieldDescription>
            Instructor ratings come from Rate My Professors for this school.
            Class search and degree audits currently work with Temple
            University's Banner.
          </FieldDescription>
        )}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Continue
        </Button>
      </div>
    </form>
  );
}

function TermStep({
  terms,
  term,
  major,
  onTerm,
  onMajor,
  onBack,
  onContinue,
}: {
  terms: ReturnType<typeof useTerms>;
  term: string | null;
  major: string;
  onTerm: (term: string) => void;
  onMajor: (major: string) => void;
  onBack: () => void;
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
        You can switch terms any time from the top bar.
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
      <Field>
        <FieldLabel htmlFor="major">
          Major{" "}
          <span className="font-normal text-muted-foreground">· optional</span>
        </FieldLabel>
        <Input
          id="major"
          value={major}
          onChange={(e) => onMajor(e.target.value)}
          placeholder="e.g. Computer Science"
          autoComplete="off"
        />
        <FieldDescription>
          Shared with the advisor only if you choose. Skip it if you're just
          browsing.
        </FieldDescription>
      </Field>
      <div className="flex justify-between gap-2">
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
        Optional. Your degree audit, auto-register and Banner page overlays run
        through the Chrome extension, inside your own Banner tab. Your Banner
        login stays with Banner.
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
  draft,
  termName,
  connection,
}: {
  draft: Draft;
  termName: string | undefined;
  connection: BannerConnection | null;
}) {
  const rows: [string, string, boolean][] = [
    ["School", draft.school?.name ?? "Not chosen", !!draft.school],
    ["Term", termName ?? "Not chosen", !!termName],
    ["Major", draft.major || "Optional", !!draft.major],
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
      className="flex min-w-0 flex-[1_1_17.5rem] flex-col gap-4 pt-5"
    >
      <section className="flex flex-col gap-1 rounded-3xl bg-card px-2 pt-4 pb-2 shadow-sm ring-1 ring-foreground/5">
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
      </section>
      <div className="flex gap-2.5 rounded-3xl px-4 py-3.5 ring-1 ring-border ring-inset">
        <HardDriveIcon
          aria-hidden
          className="mt-0.5 size-4.5 shrink-0 text-muted-foreground"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium">Saved on this device</span>
          <span className="text-muted-foreground">
            Everything you set up is kept in this browser, or in the extension
            if you add it.
          </span>
        </span>
      </div>
    </aside>
  );
}
