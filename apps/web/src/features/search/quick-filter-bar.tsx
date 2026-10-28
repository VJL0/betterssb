import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Toggle } from "@workspace/ui/components/toggle";
import { PRESSED_FILTER_CLASS } from "@/lib/filter-styles";
import { QUICK_FILTERS, type QuickFilterContext } from "./quick-filters";
import { activeFilterCount, type SearchFilters } from "./search-filters";

interface QuickFilterBarProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  context: QuickFilterContext;
  /** Opens the full filters panel. */
  onOpenFilters: () => void;
}

/** The Filters button, then one-tap shortcuts for the most used filters. */
export function QuickFilterBar({
  filters,
  onChange,
  context,
  onOpenFilters,
}: QuickFilterBarProps) {
  const count = activeFilterCount(filters);
  return (
    // One scrolling row on phones, so the chips don't push results down.
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        aria-haspopup="dialog"
        onClick={onOpenFilters}
      >
        <SlidersHorizontalIcon data-icon="inline-start" />
        Filters{count > 0 && ` (${count})`}
      </Button>
      <div role="group" aria-label="Quick filters" className="contents">
        {QUICK_FILTERS.filter((q) => q.available?.(context) ?? true).map(
          (quick) => (
            <Toggle
              key={quick.label}
              variant="outline"
              size="sm"
              className={`shrink-0 ${PRESSED_FILTER_CLASS}`}
              pressed={quick.isOn(filters, context)}
              onPressedChange={(on) =>
                onChange(quick.turn(filters, on, context))
              }
            >
              {quick.label}
            </Toggle>
          ),
        )}
      </div>
    </div>
  );
}
