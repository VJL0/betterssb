import {
  GraduationCapIcon,
  HouseIcon,
  SearchIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export type PopupTab = "today" | "search" | "register" | "audit";

const TABS: { id: PopupTab; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: HouseIcon },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "register", label: "Register", icon: TimerIcon },
  { id: "audit", label: "Audit", icon: GraduationCapIcon },
];

/** XPopupTabs: the popup's four sections, at the bottom. */
export function PopupTabs({
  active,
  onSelect,
}: {
  active: PopupTab;
  onSelect: (tab: PopupTab) => void;
}) {
  return (
    <nav aria-label="Popup sections" className="shrink-0 border-t px-1 py-1">
      <ul className="grid grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              aria-current={active === id ? "page" : undefined}
              onClick={() => onSelect(id)}
              className={cn(
                "flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                active === id && "bg-muted text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4.5" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
