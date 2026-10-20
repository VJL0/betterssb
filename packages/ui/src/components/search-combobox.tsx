"use client";

import { useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  DEFAULT_MIN_QUERY_LENGTH,
  useDebouncedSearch,
} from "@workspace/ui/hooks/use-debounced-search";

interface SearchComboboxProps<T> {
  id?: string;
  value: T | null;
  onSelect: (item: T) => void;
  /** Called once typing pauses. Should be stable (module-level or memoized). */
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  placeholder?: string;
  /** Plural noun for the empty states, e.g. "schools". */
  noun: string;
  "aria-invalid"?: boolean;
}

function emptyMessage(
  query: string,
  noun: string,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (query.trim().length < DEFAULT_MIN_QUERY_LENGTH) {
    return `Type at least ${DEFAULT_MIN_QUERY_LENGTH} letters.`;
  }
  if (isLoading) return "Searching…";
  if (hasError) return `Couldn't search ${noun}. Try again.`;
  return `No ${noun} match.`;
}

/** A combobox whose options come from a search as the student types. */
function SearchCombobox<T>({
  id,
  value,
  onSelect,
  search,
  itemKey,
  itemLabel,
  placeholder,
  noun,
  "aria-invalid": ariaInvalid,
}: SearchComboboxProps<T>) {
  const [query, setQuery] = useState(value ? itemLabel(value) : "");
  const [shownKey, setShownKey] = useState(value ? itemKey(value) : null);

  // A saved value can load after first render; show its label once it arrives.
  const valueKey = value ? itemKey(value) : null;
  if (valueKey !== shownKey) {
    setShownKey(valueKey);
    setQuery(value ? itemLabel(value) : "");
  }
  const { results, isLoading, hasError } = useDebouncedSearch(query, search);

  return (
    <Combobox<T>
      items={results}
      filter={null}
      value={value}
      onValueChange={(item) => {
        if (item) onSelect(item);
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={itemLabel}
      isItemEqualToValue={(a, b) => itemKey(a) === itemKey(b)}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showTrigger={false}
        aria-invalid={ariaInvalid}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {emptyMessage(query, noun, isLoading, hasError)}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: T) => (
            <ComboboxItem key={itemKey(item)} value={item}>
              {itemLabel(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export { SearchCombobox };
export type { SearchComboboxProps };
