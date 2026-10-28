import { XIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  appliedFilters,
  removeFilter,
  type FilterNames,
} from "./applied-filters";
import { DEFAULT_FILTERS, type SearchFilters } from "./search-filters";

interface AppliedFilterChipsProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  names: FilterNames;
  /** Filters shown elsewhere (pressed quick filters), left out of the chips. */
  base?: SearchFilters;
  className?: string;
}

/**
 * Each filter in use, removable in one click, then Clear all. Students see
 * what's narrowing the results without opening the filters.
 */
export function AppliedFilterChips({
  filters,
  onChange,
  names,
  base = DEFAULT_FILTERS,
  className,
}: AppliedFilterChipsProps) {
  const applied = appliedFilters(filters, names, base);
  if (applied.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ul aria-label="Applied filters" className="contents">
        {applied.map(({ dimension, label }) => (
          <li key={dimension} className="shrink-0">
            <Button
              variant="secondary"
              size="sm"
              aria-label={`Remove filter: ${label}`}
              className="max-w-64"
              onClick={() => onChange(removeFilter(filters, dimension, base))}
            >
              <span className="truncate">{label}</span>
              <XIcon data-icon="inline-end" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => onChange(DEFAULT_FILTERS)}
      >
        Clear all
      </Button>
    </div>
  );
}
