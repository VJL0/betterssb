import {
  BrainCircuitIcon,
  CalendarDaysIcon,
  GraduationCapIcon,
  ListChecksIcon,
  NotebookTextIcon,
  SearchIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";

export interface AppPage {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Shown in the phone tab bar; the rest go under More. */
  inTabBar: boolean;
  /**
   * Built and live. Pages that aren't built yet stay out of navigation
   * entirely rather than linking to a placeholder.
   */
  ready: boolean;
}

/** The top bar's pages, in design order (WHeader). */
export const PRIMARY_PAGES: readonly AppPage[] = [
  {
    id: "search",
    label: "Search",
    path: "/search",
    icon: SearchIcon,
    inTabBar: true,
    ready: true,
  },
  {
    id: "schedule",
    label: "Schedule",
    path: "/schedule",
    icon: CalendarDaysIcon,
    inTabBar: true,
    ready: true,
  },
  {
    id: "plan",
    label: "Plan",
    path: "/plan",
    icon: NotebookTextIcon,
    inTabBar: false,
    ready: true,
  },
  {
    id: "register",
    label: "Register",
    path: "/register",
    icon: TimerIcon,
    inTabBar: true,
    ready: true,
  },
  {
    id: "audit",
    label: "Audit",
    path: "/audit",
    icon: GraduationCapIcon,
    inTabBar: true,
    ready: true,
  },
  {
    id: "advisor",
    label: "Advisor",
    path: "/advisor",
    icon: BrainCircuitIcon,
    inTabBar: false,
    ready: true,
  },
];

/** Reached from the account area and More, not the top bar. */
export const SECONDARY_PAGES: readonly AppPage[] = [
  {
    id: "transcript",
    label: "Transcript",
    path: "/transcript",
    icon: ListChecksIcon,
    inTabBar: false,
    ready: true,
  },
];

/** Whether a page is built, for links to it from other pages. */
export function isPageReady(id: string): boolean {
  return [...PRIMARY_PAGES, ...SECONDARY_PAGES].some(
    (p) => p.id === id && p.ready,
  );
}

export function readyPages(pages: readonly AppPage[]): AppPage[] {
  return pages.filter((p) => p.ready);
}

/** Where "Start planning" goes: the first built page in the top bar. */
export function firstReadyPath(): string {
  return readyPages(PRIMARY_PAGES)[0]?.path ?? "/settings";
}
