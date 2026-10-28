import { ArrowUpDownIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { SORT_OPTIONS, type SortKey } from "./sort-results";

const ITEMS = (Object.keys(SORT_OPTIONS) as SortKey[]).map((value) => ({
  value,
  label: SORT_OPTIONS[value].label,
}));

interface SortSelectProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  /** Rating and difficulty sorts wait for instructor ratings. */
  ratingsReady: boolean;
}

/** How to order the courses and the sections inside each. */
export function SortSelect({ value, onChange, ratingsReady }: SortSelectProps) {
  return (
    <Select
      items={ITEMS}
      value={value}
      onValueChange={(picked) => {
        if (picked) onChange(picked as SortKey);
      }}
    >
      <SelectTrigger size="sm" aria-label="Sort by">
        <ArrowUpDownIcon aria-hidden className="text-muted-foreground" />
        <span className="text-muted-foreground">Sort by</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ITEMS.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            disabled={SORT_OPTIONS[item.value].needsRatings && !ratingsReady}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
