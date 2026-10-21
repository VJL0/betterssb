"use client";

import {
  CircleXIcon,
  InfoIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { courseCode, plannedSectionFrom } from "@workspace/shared/lib/plan";
import { planCredits } from "@workspace/shared/lib/plan";
import { primaryInstructorName } from "@workspace/shared/lib/sections";
import type { PlannedSection } from "@workspace/shared/types/store";
import {
  Alert,
  AlertAction,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Kbd } from "@workspace/ui/components/kbd";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { RatingsStatus } from "@/components/ratings-status";
import {
  PAGE_SIZE,
  useClassSearch,
  type ClassSearch,
} from "@/hooks/use-class-search";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { usePlan } from "@/hooks/use-plan";
import { useRatings, type Ratings } from "@/hooks/use-ratings";
import { formatClockTime, formatUpdated } from "@/lib/relative-time";
import { undoToast } from "@/lib/undo-toast";
import { CourseCard } from "./course-card";
import { FiltersPanel } from "./filters-panel";
import { PlanRail } from "./plan-rail";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  groupByCourse,
  mostRestrictiveFilter,
  resetFilter,
  sectionPasses,
  type FilterName,
  type SearchFilters,
} from "./search-filters";
import type { ClassSection, CodeDescription } from "@workspace/api-client";
import { listAttributesOptions } from "@workspace/api-client/query";

const EXAMPLES = ["CIS 2168", "MATH", "data science"];
const CLOCK_TICK_MS = 30_000;
/** Attributes change between terms, not within one. */
const ATTRIBUTES_STALE_MS = 24 * 60 * 60 * 1000;
const NO_ATTRIBUTES: CodeDescription[] = [];

const FILTER_LABEL: Record<FilterName, string> = {
  days: "meeting days",
  minRating: "rating",
  openOnly: "open-only",
  times: "time of day",
  attributes: "attribute",
};

/** W2.1 · Course search: live sections from Banner with ratings and seats. */
export function SearchPage() {
  const { term, status: termStatus } = useCurrentTerm();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useClassSearch(term?.code ?? null, input);

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      {/* Only the query string waits for the browser. Suspending the whole
          page would hydrate it after the top bar, which may have loaded the
          terms by then and so render differently from the server. */}
      <Suspense>
        <QueryFromUrl onQuery={setInput} />
      </Suspense>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Course search
          </h1>
          <p className="text-muted-foreground">
            {term ? `${term.name} · live from Banner` : "Loading terms…"}
          </p>
        </div>
        <form
          role="search"
          className="flex min-w-0 flex-[1_1_32rem] flex-wrap items-center justify-end gap-2"
          onSubmit={(e) => e.preventDefault()}
        >
          <InputGroup className="h-9 max-w-xl flex-[1_1_22rem]">
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              type="search"
              aria-label="Search courses"
              placeholder="Course (CIS 2168), subject or keyword"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!term}
            />
            <InputGroupAddon align="inline-end">
              <Kbd aria-hidden>/</Kbd>
            </InputGroupAddon>
          </InputGroup>
          {search.result && <UpdatedButton search={search} />}
        </form>
      </div>

      {termStatus === "error" ? (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Couldn't load terms from Banner</AlertTitle>
          <AlertDescription>Reload the page to try again.</AlertDescription>
        </Alert>
      ) : term ? (
        <SearchBody
          term={term}
          search={search}
          inputRef={inputRef}
          onExample={setInput}
        />
      ) : (
        <Skeleton className="h-64 rounded-3xl" />
      )}
    </div>
  );
}

/** "Find sections" links from the audit open with ?q=CIS 4398. */
function QueryFromUrl({ onQuery }: { onQuery: (query: string) => void }) {
  const query = useSearchParams().get("q");
  useEffect(() => {
    if (query) onQuery(query);
  }, [query, onQuery]);
  return null;
}

function UpdatedButton({ search }: { search: ClassSearch }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const refreshing = search.status === "loading";
  return (
    <Button
      type="button"
      variant="outline"
      onClick={search.refresh}
      disabled={refreshing}
      aria-label={`Refresh seats. Updated ${formatUpdated(search.result!.fetchedAt, now)}`}
    >
      {refreshing ? (
        <Spinner data-icon="inline-start" aria-hidden />
      ) : (
        <RefreshCwIcon data-icon="inline-start" />
      )}
      Updated {formatUpdated(search.result!.fetchedAt, now)}
    </Button>
  );
}

interface SearchBodyProps {
  term: { code: string; name: string };
  search: ClassSearch;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onExample: (query: string) => void;
}

function SearchBody({ term, search, inputRef, onExample }: SearchBodyProps) {
  const planState = usePlan(term.code, term.name);
  const { plan } = planState;
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [preview, setPreview] = useState<PlannedSection | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const attributes = useAttributes(term.code);

  const sections = useMemo(
    () => search.result?.sections ?? [],
    [search.result],
  );
  const ratings = useRatings(sections.map(primaryInstructorName));
  const visible = sections.filter((s) =>
    sectionPasses(s, filters, ratings.byName),
  );
  const groups = groupByCourse(visible);
  const plannedCrns = new Set(plan.sections.map((s) => s.crn));

  async function toggle(section: ClassSection) {
    const before = plan;
    const label = `${courseCode(section.subject, section.courseNumber)} · ${section.sequenceNumber}`;
    const planned = plannedCrns.has(section.courseReferenceNumber);
    try {
      if (planned) await planState.remove(section.courseReferenceNumber);
      else
        await planState.add(
          plannedSectionFrom(section, new Date().toISOString()),
        );
      undoToast(
        planned
          ? `Removed ${label} from your ${term.name} plan`
          : `Added ${label} to your ${term.name} plan`,
        () => void planState.restore(before),
      );
    } catch {
      toast.error("Couldn't save your plan. Try again.");
    }
  }

  async function removeFromRail(section: PlannedSection) {
    const before = plan;
    await planState.remove(section.crn);
    undoToast(
      `Removed ${section.courseCode} · ${section.section} from your plan`,
      () => void planState.restore(before),
    );
  }

  useKeyboardShortcuts({
    "/": () => inputRef.current?.focus(),
    j: () => movePlanButtonFocus(1),
    k: () => movePlanButtonFocus(-1),
    a: () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.dataset.planButton !== undefined
      ) {
        active.click();
      }
    },
  });

  const filterCount = activeFilterCount(filters);
  const filtersPanel = (
    <FiltersPanel
      filters={filters}
      onChange={setFilters}
      attributes={attributes}
      ratingsReady={ratings.status === "ready"}
    />
  );
  const rail = (
    <PlanRail
      plan={plan}
      termName={term.name}
      preview={preview}
      onRemove={(s) => void removeFromRail(s)}
    />
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
      <aside aria-label="Filters" className="hidden lg:block">
        {filtersPanel}
      </aside>

      <section aria-label="Results" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap gap-2 lg:hidden">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontalIcon data-icon="inline-start" />
            Filters{filterCount > 0 && ` (${filterCount})`}
          </Button>
        </div>

        <Results
          term={term}
          search={search}
          groups={groups}
          sections={sections}
          visibleCount={visible.length}
          filters={filters}
          ratings={ratings}
          onResetFilter={(name) => setFilters(resetFilter(filters, name))}
          onResetAll={() => setFilters(DEFAULT_FILTERS)}
          onExample={onExample}
          card={(group) => (
            <CourseCard
              key={group.courseId}
              sections={group.sections}
              plan={plan}
              termName={term.name}
              ratings={ratings}
              isPlanned={(crn) => plannedCrns.has(crn)}
              onToggle={(s) => void toggle(s)}
              onPreview={(s) =>
                setPreview(
                  s ? plannedSectionFrom(s, new Date().toISOString()) : null,
                )
              }
            />
          )}
        />
      </section>

      <aside aria-label="Plan" className="sticky top-24 hidden xl:block">
        {rail}
      </aside>

      <div className="sticky bottom-20 z-30 flex justify-center sm:bottom-4 xl:hidden">
        <Button
          size="lg"
          className="shadow-lg"
          onClick={() => setPlanOpen(true)}
        >
          {term.name} plan · {planCredits(plan)} cr
        </Button>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{filtersPanel}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={planOpen} onOpenChange={setPlanOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{term.name} plan</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{rail}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function movePlanButtonFocus(step: 1 | -1) {
  const buttons = [
    ...document.querySelectorAll<HTMLElement>("[data-plan-button]"),
  ].filter((b) => b.offsetParent !== null);
  if (buttons.length === 0) return;
  const current = buttons.indexOf(document.activeElement as HTMLElement);
  const next =
    current === -1
      ? step === 1
        ? 0
        : buttons.length - 1
      : Math.min(buttons.length - 1, Math.max(0, current + step));
  buttons[next]?.focus();
}

/** Section attributes for the filter. Optional: search works without them. */
function useAttributes(term: string): CodeDescription[] {
  const { data } = useQuery({
    ...listAttributesOptions({ query: { term } }),
    staleTime: ATTRIBUTES_STALE_MS,
  });
  return data ?? NO_ATTRIBUTES;
}

interface ResultsProps {
  term: { code: string; name: string };
  search: ClassSearch;
  groups: ReturnType<typeof groupByCourse>;
  sections: ClassSection[];
  visibleCount: number;
  filters: SearchFilters;
  ratings: Ratings;
  onResetFilter: (name: FilterName) => void;
  onResetAll: () => void;
  onExample: (query: string) => void;
  card: (group: ReturnType<typeof groupByCourse>[number]) => React.ReactNode;
}

function Results({
  term,
  search,
  groups,
  sections,
  visibleCount,
  filters,
  ratings,
  onResetFilter,
  onResetAll,
  onExample,
  card,
}: ResultsProps) {
  if (search.query.kind === "crn") {
    return (
      <Alert variant="info">
        <InfoIcon />
        <AlertTitle>CRN lookup isn't available here</AlertTitle>
        <AlertDescription>
          Banner's public class search can't look up a CRN. Search by course,
          like CIS 2168, or by subject.
        </AlertDescription>
      </Alert>
    );
  }

  if (search.status === "idle") {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>Search {term.name} sections</EmptyTitle>
          <EmptyDescription>
            Type a course like CIS 2168, a subject like MATH, or a keyword.
            Results come live from Banner with seats and ratings.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row flex-wrap justify-center">
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              onClick={() => onExample(example)}
            >
              {example}
            </Button>
          ))}
        </EmptyContent>
      </Empty>
    );
  }

  if (!search.result) {
    if (search.status === "error") {
      return (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Couldn't search Banner</AlertTitle>
          <AlertDescription>{search.error?.message}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={search.refresh}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      );
    }
    return <LoadingResults />;
  }

  const result = search.result;
  const courses = groups.length;
  const hiddenByFilters = sections.length - visibleCount;
  const suggestion =
    visibleCount === 0 && sections.length > 0
      ? mostRestrictiveFilter(sections, filters, ratings.byName)
      : null;

  return (
    <div className="flex flex-col gap-4">
      {search.stale && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Banner isn't responding</AlertTitle>
          <AlertDescription>
            Showing results from {formatClockTime(result.fetchedAt)}. Seats may
            have changed.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={search.refresh}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="text-muted-foreground tabular-nums">
          {sections.length === 0
            ? "No sections found."
            : `${visibleCount} of ${result.totalCount} sections · ${courses} course${courses === 1 ? "" : "s"}${hiddenByFilters > 0 ? ` · ${hiddenByFilters} hidden by filters` : ""}`}
        </p>
        <RatingsStatus ratings={ratings} />
      </div>

      {sections.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing in {term.name} matches</EmptyTitle>
            <EmptyDescription>
              Check the course number, or try a subject or keyword.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visibleCount === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No sections match your filters</EmptyTitle>
            <EmptyDescription>
              {suggestion
                ? `Removing the ${FILTER_LABEL[suggestion.filter]} filter brings back ${suggestion.recovered} section${suggestion.recovered === 1 ? "" : "s"}.`
                : "Your filters hide every section."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row flex-wrap justify-center">
            {suggestion && (
              <Button
                size="sm"
                onClick={() => onResetFilter(suggestion.filter)}
              >
                Remove {FILTER_LABEL[suggestion.filter]} filter
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onResetAll}>
              Reset filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div
          className={cn("flex flex-col gap-4", search.stale && "opacity-60")}
        >
          {groups.map(card)}
        </div>
      )}

      {sections.length < result.totalCount && (
        <Button
          variant="outline"
          className="self-center"
          onClick={search.loadMore}
          disabled={search.loadingMore}
        >
          {search.loadingMore && (
            <Spinner data-icon="inline-start" aria-hidden />
          )}
          Load {Math.min(PAGE_SIZE, result.totalCount - sections.length)} more
        </Button>
      )}
    </div>
  );
}

function LoadingResults() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-muted-foreground">
        Loading sections from Banner…
      </p>
      {[0, 1, 2].map((i) => (
        <Card key={i} aria-hidden className="gap-3.5 p-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-5 w-16 rounded-2xl" />
            <Skeleton className="h-4 w-56 rounded-2xl" />
          </div>
          {[0, 1].map((row) => (
            <div
              key={row}
              className="grid grid-cols-[4.5rem_1.4fr_1.4fr_1fr_8.75rem_2rem] items-center gap-4"
            >
              <Skeleton className="h-3 rounded-2xl" />
              <Skeleton className="h-3 rounded-2xl" />
              <Skeleton className="h-3 rounded-2xl" />
              <Skeleton className="h-3 rounded-2xl" />
              <Skeleton className="h-1.5 rounded-2xl" />
              <Skeleton className="size-8 rounded-2xl" />
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
