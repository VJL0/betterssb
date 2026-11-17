import {
  BrainCircuitIcon,
  CalendarDaysIcon,
  EyeIcon,
  FolderOpenIcon,
  NotebookTextIcon,
  SearchIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";

/** What the student is doing: planning classes, getting into them, or seeing where they stand. */
export type PageGroup = "planning" | "registration" | "degree";

export const PAGE_GROUP_LABELS: Record<PageGroup, string> = {
  planning: "Planning",
  registration: "Registration",
  degree: "Your degree",
};

export interface AppPage {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: PageGroup;
  /**
   * Built and live. Pages that aren't built yet stay out of navigation
   * entirely rather than linking to a placeholder.
   */
  ready: boolean;
}

/** Every page, in top bar order (WHeader), group by group. */
export const APP_PAGES: readonly AppPage[] = [
  {
    id: "search",
    label: "Search",
    path: "/search",
    icon: SearchIcon,
    group: "planning",
    ready: true,
  },
  {
    id: "schedule",
    label: "Schedule",
    path: "/schedule",
    icon: CalendarDaysIcon,
    group: "planning",
    ready: true,
  },
  {
    id: "plan",
    label: "Plan",
    path: "/plan",
    icon: NotebookTextIcon,
    group: "planning",
    ready: true,
  },
  {
    id: "register",
    label: "Register",
    path: "/register",
    icon: TimerIcon,
    group: "registration",
    ready: true,
  },
  {
    id: "seats",
    label: "Seats",
    path: "/seats",
    icon: EyeIcon,
    group: "registration",
    ready: true,
  },
  {
    id: "records",
    label: "Records",
    path: "/records/audit",
    icon: FolderOpenIcon,
    group: "degree",
    ready: true,
  },
  {
    id: "advisor",
    label: "Advisor",
    path: "/advisor",
    icon: BrainCircuitIcon,
    group: "degree",
    ready: true,
  },
];

/** A page's path when it's built, for links to it from other pages. */
export function readyPagePath(id: string | undefined): string | null {
  const page = APP_PAGES.find((p) => p.id === id);
  return page?.ready ? page.path : null;
}

/** Whether a page is built, for links to it from other pages. */
export function isPageReady(id: string): boolean {
  return readyPagePath(id) !== null;
}

export function readyPages(pages: readonly AppPage[]): AppPage[] {
  return pages.filter((p) => p.ready);
}

/** Where "Start planning" goes: the first built page in the top bar. */
export function firstReadyPath(): string {
  return readyPages(APP_PAGES)[0]?.path ?? "/settings";
}

/** Built pages in their groups, in order, for the top bar and the phone menu. */
export function groupedPages(): { group: PageGroup; pages: AppPage[] }[] {
  const pages = readyPages(APP_PAGES);
  return (Object.keys(PAGE_GROUP_LABELS) as PageGroup[])
    .map((group) => ({ group, pages: pages.filter((p) => p.group === group) }))
    .filter(({ pages }) => pages.length > 0);
}
