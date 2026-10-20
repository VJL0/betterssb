import { useId } from "react";
import {
  DAY_NAMES,
  WEEKDAYS,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import type { CodeDescription } from "@workspace/api-client";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
import { Switch } from "@workspace/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { HourSelect } from "@/components/hour-select";
import { PRESSED_FILTER_CLASS } from "@/lib/filter-styles";
import {
  DEFAULT_FILTERS,
  MIN_RATING_OPTIONS,
  type MinRating,
  type SearchFilters,
} from "./search-filters";

const RATING_LABEL: Record<MinRating, string> = {
  0: "Any",
  3.5: "3.5+",
  4: "4.0+",
};

interface FiltersPanelProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  attributes: CodeDescription[];
}

export function FiltersPanel({
  filters,
  onChange,
  attributes,
}: FiltersPanelProps) {
  const ids = useId();
  const set = (patch: Partial<SearchFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Filters</h2>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS)}
        >
          Reset
        </Button>
      </div>

      <FieldSet>
        <FieldLegend variant="label">Meeting days</FieldLegend>
        <ToggleGroup
          multiple
          variant="outline"
          spacing={1}
          value={filters.days}
          onValueChange={(days) => set({ days: days as WeekDay[] })}
          className="w-full"
        >
          {WEEKDAYS.map((day) => (
            <ToggleGroupItem
              key={day}
              value={day}
              aria-label={DAY_NAMES[day]}
              className={`flex-1 ${PRESSED_FILTER_CLASS}`}
            >
              {day}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Instructor rating</FieldLegend>
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[String(filters.minRating)]}
          onValueChange={(value) => {
            const picked = Number(value[0] ?? 0) as MinRating;
            set({ minRating: picked });
          }}
          className="w-full"
        >
          {MIN_RATING_OPTIONS.map((rating) => (
            <ToggleGroupItem
              key={rating}
              value={String(rating)}
              className={`flex-1 ${PRESSED_FILTER_CLASS}`}
            >
              {RATING_LABEL[rating]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${ids}-open`}>Open sections only</FieldLabel>
          <FieldDescription>Hide full and closed</FieldDescription>
        </FieldContent>
        <Switch
          id={`${ids}-open`}
          checked={filters.openOnly}
          onCheckedChange={(openOnly) => set({ openOnly })}
        />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Time of day</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          <HourSelect
            label="Starts after"
            className="w-full tabular-nums"
            value={filters.startAfter}
            onChange={(startAfter) => set({ startAfter })}
          />
          <HourSelect
            label="Ends before"
            className="w-full tabular-nums"
            value={filters.endBefore}
            onChange={(endBefore) => set({ endBefore })}
          />
        </div>
      </FieldSet>

      {attributes.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Attributes</FieldLegend>
          <div className="flex max-h-56 flex-col gap-2.5 overflow-y-auto pr-1">
            {attributes.map((attribute) => {
              const id = `${ids}-attr-${attribute.code}`;
              const checked = filters.attributes.includes(attribute.code);
              return (
                <Field key={attribute.code} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(on) =>
                      set({
                        attributes: on
                          ? [...filters.attributes, attribute.code]
                          : filters.attributes.filter(
                              (c) => c !== attribute.code,
                            ),
                      })
                    }
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {attribute.description}
                  </FieldLabel>
                </Field>
              );
            })}
          </div>
        </FieldSet>
      )}
    </div>
  );
}
