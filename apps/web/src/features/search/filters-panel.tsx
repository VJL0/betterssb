import { useId } from "react";
import {
  DAY_NAMES,
  WEEKDAYS,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import { formatRating } from "@workspace/shared/lib/ratings";
import type { CodeDescription } from "@workspace/api-client";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group";
import { cn } from "@workspace/ui/lib/utils";
import { HourSelect } from "@/components/hour-select";
import { PRESSED_FILTER_CLASS } from "@/lib/filter-styles";
import {
  COURSE_LEVELS,
  FORMATS,
  GENED_PREFIX,
  isGenEdArea,
  type CourseLevel,
  type Format,
} from "./banner-filters";
import {
  LEVEL_LABEL,
  maxDifficultyLabel,
  minRatingLabel,
} from "./filter-labels";
import { RMP_SCALE, type SearchFilters } from "./search-filters";

const ANY = "any";

export interface SearchOptions {
  attributes: CodeDescription[];
  campuses: CodeDescription[];
  partsOfTerm: CodeDescription[];
}

export const NO_OPTIONS: CodeDescription[] = [];

interface FiltersPanelProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  options: SearchOptions;
  /** False while instructor ratings are still loading, when filtering by them can't work. */
  ratingsReady: boolean;
}

export function FiltersPanel({
  filters,
  onChange,
  options,
  ratingsReady,
}: FiltersPanelProps) {
  const ids = useId();
  const set = (patch: Partial<SearchFilters>) =>
    onChange({ ...filters, ...patch });
  const genEdAreas = options.attributes.filter(isGenEdArea);
  const otherAttributes = options.attributes.filter((a) => !isGenEdArea(a));

  return (
    <div className="flex flex-col gap-5">
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

      <FilterGroup title="When">
        <FieldSet className="gap-0">
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

        <FieldSet className="gap-0">
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

        <OptionSelect
          label="Part of term"
          anyLabel="Any part of term"
          options={options.partsOfTerm}
          value={filters.partOfTerm}
          onChange={(partOfTerm) => set({ partOfTerm })}
        />
      </FilterGroup>

      <FilterGroup title="Instructor">
        <Field className="gap-2">
          <FieldLabel htmlFor={`${ids}-instructor`}>Name</FieldLabel>
          <Input
            id={`${ids}-instructor`}
            aria-label="Instructor name"
            type="search"
            placeholder="First or last name"
            autoComplete="off"
            aria-describedby={`${ids}-instructor-help`}
            value={filters.instructor}
            onChange={(e) => set({ instructor: e.target.value })}
          />
          <FieldDescription id={`${ids}-instructor-help`}>
            Finds their sections even with nothing typed above.
          </FieldDescription>
        </Field>

        <ScoreSlider
          label="Rating"
          sliderLabel="Minimum instructor rating"
          valueLabel={minRatingLabel(filters.minRating)}
          value={filters.minRating ?? RMP_SCALE.min}
          // Everything from the thumb up passes, so the right side lights up.
          fill="end"
          isAny={filters.minRating === null}
          ends={["Any", formatRating(RMP_SCALE.max)]}
          valueText={(v) =>
            v <= RMP_SCALE.min ? "Any rating" : `${formatRating(v)} or higher`
          }
          onChange={(v) => set({ minRating: v <= RMP_SCALE.min ? null : v })}
          disabled={!ratingsReady}
        />

        <ScoreSlider
          label="Difficulty"
          sliderLabel="Maximum instructor difficulty"
          valueLabel={maxDifficultyLabel(filters.maxDifficulty)}
          value={filters.maxDifficulty ?? RMP_SCALE.max}
          fill="start"
          isAny={filters.maxDifficulty === null}
          ends={[`${formatRating(RMP_SCALE.min)} easy`, "Any"]}
          valueText={(v) =>
            v >= RMP_SCALE.max
              ? "Any difficulty"
              : `${formatRating(v)} or lower, out of 5`
          }
          onChange={(v) =>
            set({ maxDifficulty: v >= RMP_SCALE.max ? null : v })
          }
          disabled={!ratingsReady}
        />

        {!ratingsReady && (
          <FieldDescription>
            Rating and difficulty work once ratings load.
          </FieldDescription>
        )}
      </FilterGroup>

      <FilterGroup title="Where and how">
        <FieldSet className="gap-2">
          <FieldLegend variant="label" className="mb-1">
            Format
          </FieldLegend>
          <ToggleGroup
            multiple
            variant="outline"
            spacing={1}
            aria-describedby={`${ids}-format-help`}
            value={filters.formats}
            onValueChange={(formats) => set({ formats: formats as Format[] })}
            className="grid w-full grid-cols-2"
          >
            {(Object.keys(FORMATS) as Format[]).map((format) => (
              <ToggleGroupItem
                key={format}
                value={format}
                className={PRESSED_FILTER_CLASS}
              >
                {FORMATS[format].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription id={`${ids}-format-help`}>
            Async classes have no scheduled meetings.
          </FieldDescription>
        </FieldSet>

        <OptionSelect
          label="Campus"
          anyLabel="Any campus"
          options={options.campuses}
          value={filters.campus}
          onChange={(campus) => set({ campus })}
        />
      </FilterGroup>

      <FilterGroup title="Course">
        <FieldSet className="gap-0">
          <FieldLegend variant="label">Level</FieldLegend>
          <ToggleGroup
            multiple
            variant="outline"
            spacing={1}
            value={filters.levels.map(String)}
            onValueChange={(levels) =>
              set({ levels: levels.map(Number) as CourseLevel[] })
            }
            className="grid w-full grid-cols-3"
          >
            {COURSE_LEVELS.map((level) => (
              <ToggleGroupItem
                key={level}
                value={String(level)}
                aria-label={LEVEL_LABEL[level].name}
                className={`tabular-nums ${PRESSED_FILTER_CLASS}`}
              >
                {LEVEL_LABEL[level].short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>

        <AttributeChecklist
          legend="GenEd areas"
          description="Picking one finds sections even with nothing typed above."
          attributes={genEdAreas}
          checked={filters.attributes}
          onChange={(attributes) => set({ attributes })}
          label={(a) => a.description.slice(GENED_PREFIX.length)}
        />
        <AttributeChecklist
          legend="Other attributes"
          attributes={otherAttributes}
          checked={filters.attributes}
          onChange={(attributes) => set({ attributes })}
          scrolls
        />
      </FilterGroup>
    </div>
  );
}

/** A titled run of related filters, ruled off from the one above. */
function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <Separator />
      <h3
        id={id}
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

interface AttributeChecklistProps {
  legend: string;
  description?: string;
  attributes: CodeDescription[];
  /** Every checked code, from this list and others. */
  checked: string[];
  onChange: (checked: string[]) => void;
  label?: (attribute: CodeDescription) => string;
  /** Cap the list's height, for long lists. */
  scrolls?: boolean;
}

/** Banner attributes to check; sections need any one checked code. */
function AttributeChecklist({
  legend,
  description,
  attributes,
  checked,
  onChange,
  label = (attribute) => attribute.description,
  scrolls = false,
}: AttributeChecklistProps) {
  const ids = useId();
  if (attributes.length === 0) return null;
  return (
    <FieldSet className="gap-2.5">
      <FieldLegend variant="label" className="mb-1">
        {legend}
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <div
        className={cn(
          "flex flex-col gap-2.5",
          scrolls && "max-h-56 overflow-y-auto pr-1",
        )}
      >
        {attributes.map((attribute) => {
          const id = `${ids}-${attribute.code}`;
          return (
            <Field key={attribute.code} orientation="horizontal">
              <Checkbox
                id={id}
                checked={checked.includes(attribute.code)}
                onCheckedChange={(on) =>
                  onChange(
                    on
                      ? [...checked, attribute.code]
                      : checked.filter((c) => c !== attribute.code),
                  )
                }
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {label(attribute)}
              </FieldLabel>
            </Field>
          );
        })}
      </div>
    </FieldSet>
  );
}

interface ScoreSliderProps {
  label: string;
  /** The slider's name for screen readers, which don't see the section heading. */
  sliderLabel: string;
  /** The current setting, beside the label ("3.5+", "Any"). */
  valueLabel: string;
  value: number;
  /** The side of the thumb that passes, highlighted once the filter is on. */
  fill: "start" | "end";
  /** True when it filters nothing, so the track stays plain. */
  isAny: boolean;
  /** Captions under the track's two ends. */
  ends: [string, string];
  valueText: (value: number) => string;
  onChange: (value: number) => void;
  disabled: boolean;
}

/** A Rate My Professors minimum or maximum on the 1–5 scale. */
function ScoreSlider({
  label,
  sliderLabel,
  valueLabel,
  ends,
  isAny,
  ...slider
}: ScoreSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span aria-hidden className="text-muted-foreground tabular-nums">
          {valueLabel}
        </span>
      </div>
      <Slider
        label={sliderLabel}
        min={RMP_SCALE.min}
        max={RMP_SCALE.max}
        step={RMP_SCALE.step}
        value={slider.value}
        onValueChange={slider.onChange}
        valueText={slider.valueText}
        fill={isAny ? "none" : slider.fill}
        disabled={slider.disabled}
      />
      <div
        aria-hidden
        className="flex justify-between text-xs text-muted-foreground tabular-nums"
      >
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

interface OptionSelectProps {
  label: string;
  anyLabel: string;
  options: CodeDescription[];
  value: string | null;
  onChange: (code: string | null) => void;
}

/** One of a Banner code list, or any. Hidden until the list loads. */
function OptionSelect({
  label,
  anyLabel,
  options,
  value,
  onChange,
}: OptionSelectProps) {
  const id = useId();
  if (options.length === 0) return null;
  const items = [
    { value: ANY, label: anyLabel },
    ...options.map((o) => ({ value: o.code, label: o.description })),
  ];
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value ?? ANY}
        onValueChange={(picked) =>
          onChange(picked === ANY || picked === null ? null : picked)
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
