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
} from "@/hooks/useDebouncedSearch";
import { sendMessage } from "@/lib/messaging";
import type { RMPSchool } from "@workspace/shared/types";

export interface SchoolComboboxProps {
  id?: string;
  value: RMPSchool | null;
  onSelect: (school: RMPSchool) => void;
}

async function fetchSchools(query: string): Promise<RMPSchool[]> {
  const res = await sendMessage({
    type: "SEARCH_SCHOOLS",
    payload: { query },
  });
  if (!res.success) throw new Error(res.error ?? "School search failed");
  return Array.isArray(res.data) ? (res.data as RMPSchool[]) : [];
}

function emptyMessage(
  query: string,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (query.trim().length < DEFAULT_MIN_QUERY_LENGTH) {
    return `Type at least ${DEFAULT_MIN_QUERY_LENGTH} letters.`;
  }
  if (isLoading) return "Searching…";
  if (hasError) return "Couldn't search schools. Try again.";
  return "No schools match.";
}

export function SchoolCombobox({ id, value, onSelect }: SchoolComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [shownSchoolId, setShownSchoolId] = useState(value?.id);

  // The saved school loads after first render; show its name once it arrives.
  if (value?.id !== shownSchoolId) {
    setShownSchoolId(value?.id);
    setQuery(value?.name ?? "");
  }
  const { results, isLoading, hasError } = useDebouncedSearch(
    query,
    fetchSchools,
  );

  return (
    <Combobox<RMPSchool>
      items={results}
      filter={null}
      value={value}
      onValueChange={(school) => {
        if (school) onSelect(school);
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={(school) => school.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
    >
      <ComboboxInput
        id={id}
        placeholder="Search schools"
        showTrigger={false}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {emptyMessage(query, isLoading, hasError)}
        </ComboboxEmpty>
        <ComboboxList>
          {(school: RMPSchool) => (
            <ComboboxItem key={school.id} value={school}>
              {school.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
