import {
  ArrowRightIcon,
  CheckIcon,
  HardDriveIcon,
  PlugIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { ButtonLink } from "@/components/button-link";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import { readyPagePath } from "@/components/shell/pages";
import { Logo } from "@workspace/ui/components/logo";
import { EXTENSION_INSTALL_URL, SOURCE_CODE_URL } from "@/lib/config";
import {
  AdvisorPreview,
  AuditPreview,
  BannerPreview,
  PlannerPreview,
  PreviewFrame,
  RegisterPreview,
  SchedulePreview,
  SearchPreview,
} from "./previews";

type Need = "now" | "extension";

interface Feature {
  id: string;
  tab: string;
  need: Need;
  title: string;
  body: string;
  points: string[];
  /** The app page it opens, if that page is built. */
  pageId?: string;
  cta: string;
  preview: ReactNode;
  previewLabel: string;
}

const FEATURES: Feature[] = [
  {
    id: "schedule",
    tab: "Schedules",
    need: "now",
    title: "Conflict-free schedules in seconds",
    body: "Pick your courses and the days you want on campus. BetterSSB tries every combination of sections and ranks what's left.",
    points: [
      "Ranked by your days, times or instructor ratings",
      "Gaps and labs shown right on the week",
      "Save one to your plan or queue its CRNs",
    ],
    pageId: "schedule",
    cta: "Open the schedule builder",
    preview: <SchedulePreview />,
    previewLabel: "A week calendar of five courses in their plan colors",
  },
  {
    id: "plan",
    tab: "Planner",
    need: "now",
    title: "See every term until graduation",
    body: "Lay out the rest of your degree term by term, with credit totals and a projected graduation date.",
    points: [
      "Credits for every term at a glance",
      "Place remaining requirements from your audit",
      "A projected graduation date that updates as you plan",
    ],
    pageId: "plan",
    cta: "Open the planner",
    preview: <PlannerPreview />,
    previewLabel: "Two planned terms with their courses and credits",
  },
  {
    id: "audit",
    tab: "Degree audit",
    need: "now",
    title: "Your audit, readable",
    body: "Run DARS through the extension or upload a saved audit, and get a clear list of what's done, in progress and still needed.",
    points: [
      "Filter to just what's left",
      "Every requirement marked done, in progress or needed",
      "Jump from a requirement to its sections",
    ],
    pageId: "audit",
    cta: "Open the audit",
    preview: <AuditPreview />,
    previewLabel: "Degree requirements marked done, in progress and needed",
  },
  {
    id: "register",
    tab: "Auto-register",
    need: "extension",
    title: "Register the second your window opens",
    body: "Queue your CRNs. At the time you set, the extension submits them in your own signed-in Banner tab.",
    points: [
      "Checks Banner, the term and your CRNs before arming",
      "A result for every CRN when it runs",
      "Your Banner password never leaves Banner",
    ],
    pageId: "register",
    cta: "Open auto-register",
    preview: <RegisterPreview />,
    previewLabel: "A countdown to registration and a queue of three CRNs",
  },
  {
    id: "advisor",
    tab: "Advisor",
    need: "now",
    title: "Ask about your degree in plain words",
    body: "Ask about courses, prerequisites and your plan. You choose whether it sees your audit, transcript and plan.",
    points: [
      "Uses only what you choose to share",
      "Keeps your conversations in this browser",
      "Not a replacement for your real advisor",
    ],
    pageId: "advisor",
    cta: "Ask the advisor",
    preview: <AdvisorPreview />,
    previewLabel: "A question about electives and the advisor's answer",
  },
  {
    id: "banner",
    tab: "Inside Banner",
    need: "extension",
    title: "Ratings and seats on Banner's own pages",
    body: "The extension adds instructor ratings, seat meters and your plan to the registration pages you already use.",
    points: [
      "Never moves Banner's layout around",
      "Flags sections that conflict with your plan",
      "One switch turns it all off",
    ],
    cta: "",
    preview: <BannerPreview />,
    previewLabel: "Banner search results with ratings and seat meters added",
  },
];

const NEED_BADGE: Record<Need, { label: string; variant: "success" | "info" }> =
  {
    now: { label: "Works right away", variant: "success" },
    extension: { label: "Needs the Chrome extension", variant: "info" },
  };

function GetStartedButton({ size = "lg" }: { size?: "lg" | "default" }) {
  return (
    <ButtonLink size={size} href="/start">
      Get started
      <ArrowRightIcon data-icon="inline-end" />
    </ButtonLink>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h2
        id={id}
        className="text-[clamp(1.75rem,4vw,2.25rem)] leading-tight font-semibold tracking-tight"
      >
        {title}
      </h2>
      {description && (
        <p className="text-base text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

const SECTION_CLASS = "mx-auto max-w-6xl px-4 pt-24 sm:px-8 sm:pt-28";

/** W1.1 · The public landing page. */
export function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-sm text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-2xl bg-primary px-3 py-2 font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="mx-auto flex min-h-18 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <Logo />
        <nav
          aria-label="Landing"
          className="order-last flex basis-full flex-wrap gap-1 sm:order-0 sm:flex-1 sm:basis-auto"
        >
          {[
            ["#tour", "Features"],
            ["#needs", "How it works"],
            ["#privacy", "Privacy"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-2xl px-2.5 py-1.5 font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
            >
              {label}
            </a>
          ))}
        </nav>
        <GetStartedButton size="default" />
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 pt-14 text-center sm:px-8"
        >
          <span className="inline-flex h-6 items-center gap-1.5 rounded-2xl border border-border px-2.5 text-xs font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Free for Temple University students · works with Banner
          </span>
          <h1
            id="hero-heading"
            className="max-w-3xl text-[clamp(2.25rem,6vw,3.75rem)] leading-none font-semibold tracking-tighter text-balance"
          >
            The registration tool Banner should have shipped.
          </h1>
          <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
            Search every section with instructor ratings and seats, build
            conflict-free schedules, map your path to graduation, and register
            the second your window opens.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <GetStartedButton />
            {EXTENSION_INSTALL_URL && (
              <ButtonLink
                size="lg"
                variant="outline"
                href={EXTENSION_INSTALL_URL}
              >
                <PlugIcon data-icon="inline-start" />
                Add the Chrome extension
              </ButtonLink>
            )}
          </div>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <UserRoundXIcon aria-hidden className="size-3.5" />
              No account needed
            </li>
            <li className="flex items-center gap-1.5">
              <HardDriveIcon aria-hidden className="size-3.5" />
              Plans saved in your browser
            </li>
          </ul>
          <PreviewFrame
            label="A course search result: three sections with meeting days, instructor ratings and seats"
            className="mt-8 w-full max-w-4xl"
          >
            <SearchPreview />
          </PreviewFrame>
        </section>

        <section
          id="tour"
          aria-labelledby="tour-heading"
          className={SECTION_CLASS}
        >
          <div className="flex flex-col gap-7">
            <SectionHeading
              id="tour-heading"
              title="From first search to registered"
              description="Every tool works on its own. Together they take you from browsing to a confirmed schedule."
            />
            <Tabs defaultValue={FEATURES[0]!.id} className="gap-6">
              <TabsList className="h-auto flex-wrap self-start">
                {FEATURES.map((f) => (
                  <TabsTrigger key={f.id} value={f.id}>
                    {f.tab}
                  </TabsTrigger>
                ))}
              </TabsList>
              {FEATURES.map((f) => (
                <TabsContent
                  key={f.id}
                  value={f.id}
                  className="flex flex-wrap items-start gap-8"
                >
                  <FeatureCopy feature={f} />
                  <PreviewFrame
                    label={f.previewLabel}
                    className="min-w-0 grow-999 basis-lg"
                  >
                    {f.preview}
                  </PreviewFrame>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        <section
          id="needs"
          aria-labelledby="needs-heading"
          className={SECTION_CLASS}
        >
          <div className="flex flex-col gap-7">
            <SectionHeading
              id="needs-heading"
              title="Start with nothing. Add only what you need."
              description="You don't need an account or the extension to start. The extension only adds what has to happen inside Banner."
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
              <Tier
                dark
                icon={ArrowRightIcon}
                kicker="No setup"
                title="Just open it"
                body="Pick your term and start. Everything saves in this browser."
                items={[
                  "Search sections with ratings and seats",
                  "Build and compare schedules",
                  "Plan future semesters",
                  "Read a DARS audit you upload",
                  "Ask the advisor",
                ]}
                action={<GetStartedButton size="default" />}
              />
              <Tier
                icon={PlugIcon}
                kicker="Optional · works inside your Banner"
                title="Add the Chrome extension"
                body="Works inside your own Banner session. Your password never leaves Banner."
                items={[
                  "Run your degree audit from DARS",
                  "Auto-register at the time you set",
                  "Ratings and seats on Banner's pages",
                  "Your plans shared with the extension popup",
                ]}
                action={
                  EXTENSION_INSTALL_URL && (
                    <ButtonLink variant="outline" href={EXTENSION_INSTALL_URL}>
                      Add to Chrome
                    </ButtonLink>
                  )
                }
              />
            </div>
          </div>
        </section>

        <section
          id="privacy"
          aria-labelledby="privacy-heading"
          className={SECTION_CLASS}
        >
          <div className="flex flex-col gap-7">
            <SectionHeading
              id="privacy-heading"
              title="Your data stays yours"
            />
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(17.5rem,100%),1fr))] gap-8">
              {[
                [
                  "Banner stays in Banner",
                  "BetterSSB never sees your Temple password. Auto-register runs in your own signed-in Banner tab.",
                ],
                [
                  "Saved in your browser",
                  "Plans, schedules and settings live in this browser, or in the extension if you add it. An audit or transcript you upload is read by our server and not kept.",
                ],
                [
                  "Export or erase anytime",
                  "Download everything as a file or delete it from Settings.",
                ],
              ].map(([term, detail]) => (
                <div
                  key={term}
                  className="flex flex-col gap-2 border-t border-border pt-4"
                >
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-muted-foreground">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className={SECTION_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-14">
            <div className="flex max-w-xl flex-col gap-2">
              <h2
                id="cta-heading"
                className="text-[clamp(1.5rem,3.5vw,2rem)] leading-tight font-semibold tracking-tight"
              >
                Have your plan ready before registration opens.
              </h2>
              <p className="text-base text-primary-foreground/80">
                Pick your term. You'll be searching in under a minute.
              </p>
            </div>
            <ButtonLink size="lg" variant="secondary" href="/start">
              Get started
              <ArrowRightIcon data-icon="inline-end" />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 pt-12 pb-10 text-sm text-muted-foreground sm:px-8">
        <span>
          BetterSSB is an independent student project, not affiliated with
          Ellucian or Temple University.
        </span>
        <a
          href={SOURCE_CODE_URL}
          className="underline-offset-4 hover:underline"
        >
          Source code on GitHub
        </a>
      </footer>
    </div>
  );
}

function FeatureCopy({ feature }: { feature: Feature }) {
  const need = NEED_BADGE[feature.need];
  const path = readyPagePath(feature.pageId);
  return (
    <div className="flex min-w-0 grow basis-72 flex-col gap-3.5 pt-2">
      <Badge variant={need.variant} className="h-6 self-start px-2.5">
        {need.label}
      </Badge>
      <h3 className="text-2xl font-semibold tracking-tight">{feature.title}</h3>
      <p className="text-base text-muted-foreground">{feature.body}</p>
      <CheckList items={feature.points} />
      {path && (
        <Link
          href={path}
          className="self-start font-medium underline-offset-4 hover:underline"
        >
          {feature.cta}
        </Link>
      )}
    </div>
  );
}

interface TierProps {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
  items: string[];
  action: ReactNode;
  dark?: boolean;
}

function Tier({
  icon: Icon,
  kicker,
  title,
  body,
  items,
  action,
  dark,
}: TierProps) {
  return (
    <Card
      render={<article />}
      className={cn(
        "gap-4 p-6",
        dark && "bg-primary text-primary-foreground shadow-none ring-0",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            dark ? "bg-primary-foreground/10" : "bg-muted",
          )}
        >
          <Icon aria-hidden className="size-4.5" />
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            dark ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {kicker}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p
          className={
            dark ? "text-primary-foreground/80" : "text-muted-foreground"
          }
        >
          {body}
        </p>
      </div>
      <div className="flex-1">
        <CheckList items={items} />
      </div>
      {action && <div className="*:w-full">{action}</div>}
    </Card>
  );
}
